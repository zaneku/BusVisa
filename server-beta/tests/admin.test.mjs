import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../netlify/functions/gateway.mjs';
import { UPDATE_INVITE_NOTE } from '../netlify/lib/store.mjs';

process.env.INVITE_HASH_SECRET = 'local-test-secret-32-characters-long';
process.env.INVITE_ADMIN_TOKEN = 'local-admin-secret-32-characters-long';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const origin = 'https://busvisa.test';
const auth = { Authorization: `Bearer ${process.env.INVITE_ADMIN_TOKEN}` };

function request(route, options = {}) {
  return new Request(origin + route, options);
}

function redisQueue(results, inspect = () => {}) {
  globalThis.fetch = async (_url, options) => {
    const args = JSON.parse(options.body);
    inspect(args);
    assert.ok(results.length, 'unexpected Redis request');
    return Response.json({ result: results.shift() });
  };
}

test('admin page and script are available without exposing application files', async () => {
  const page = await gateway(request('/admin'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /邀请码管理/);
  const script = await gateway(request('/admin.js'));
  assert.equal(script.status, 200);
  assert.match(await script.text(), /api\/admin\/invites/);
});

test('admin API rejects missing or incorrect credentials and rate limits failures', async () => {
  process.env.INVITE_ADMIN_TOKEN = 'local-admin-secret-32-characters-long';
  const counts = new Map();
  globalThis.fetch = async (_url, options) => {
    const [operation, key] = JSON.parse(options.body);
    if (operation === 'EXPIRE') return Response.json({ result: 1 });
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return Response.json({ result: count });
  };
  const missing = await gateway(request('/api/admin/invites'));
  assert.equal(missing.status, 401);
  const wrong = await gateway(request('/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } }), { ip: 'bad-admin' });
  assert.equal(wrong.status, 401);
  let response;
  for (let i = 1; i < 10; i++) response = await gateway(request('/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } }), { ip: 'bad-admin' });
  assert.equal(response.status, 401);
  response = await gateway(request('/api/admin/invites', { headers: { Authorization: 'Bearer wrong' } }), { ip: 'bad-admin' });
  assert.equal(response.status, 429);
});

test('admin can create invite, list pages, and disable an invite', async () => {
  const row = { maxUses: 3, uses: 1, expiresAt: Math.floor(Date.now() / 1000) + 86400, disabled: false };
  const secondRow = { ...row, maxUses: 1, uses: 0 };
  const calls = [];
  redisQueue([
    'OK',
    ['17', ['busvisa:invite:' + 'a'.repeat(64)]],
    [JSON.stringify(row)],
    ['0', ['busvisa:invite:' + 'b'.repeat(64)]],
    [JSON.stringify(secondRow)],
    1
  ], args => calls.push(args));

  const createdResponse = await gateway(request('/api/admin/invites', {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxUses: 3, validDays: 14 })
  }));
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.code, /^BV-[A-Za-z0-9_-]{24}$/);
  assert.equal(created.maxUses, 3);
  assert.equal(created.uses, 0);
  assert.equal(calls[0][0], 'SET');
  assert.match(calls[0][1], /^busvisa:invite:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(calls[0]), new RegExp(created.code));

  const first = await gateway(request('/api/admin/invites?cursor=0', { headers: auth }));
  assert.equal(first.status, 200);
  const firstPage = await first.json();
  assert.equal(firstPage.cursor, '17');
  assert.equal(firstPage.invites[0].uses, 1);
  const second = await gateway(request('/api/admin/invites?cursor=17', { headers: auth }));
  assert.equal((await second.json()).invites[0].maxUses, 1);

  const disabled = await gateway(request(`/api/admin/invites/${'a'.repeat(64)}/disable`, {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' }, body: '{}'
  }));
  assert.equal(disabled.status, 204);
  assert.match(calls[5][1], /disabled=true/);
  assert.equal(calls.length, 6);
});

test('permanent invitations have no database expiration and remain manageable', async () => {
  const calls = [];
  redisQueue(['OK'], args => calls.push(args));
  const response = await gateway(request('/api/admin/invites', {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxUses: 2, permanent: true })
  }));
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.expiresAt, 0);
  assert.equal(created.maxUses, 2);
  assert.equal(JSON.parse(calls[0][2]).expiresAt, 0);
  assert.deepEqual(calls[0].slice(3), ['NX']);

  redisQueue([['0', [`busvisa:invite:${created.id}`]], [JSON.stringify(created)], 1]);
  const listed = await gateway(request('/api/admin/invites', { headers: auth }));
  assert.equal((await listed.json()).invites[0].expiresAt, 0);
  const disabled = await gateway(request(`/api/admin/invites/${created.id}/disable`, {
    method: 'POST', headers: { ...auth, Origin: origin }
  }));
  assert.equal(disabled.status, 204);
});

test('admin can create an invitation with a recipient note', async () => {
  let stored;
  redisQueue(['OK'], args => { stored = JSON.parse(args[2]); });
  const response = await gateway(request('/api/admin/invites', {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxUses: 1, validDays: 14, note: '  测试收件人  ' })
  }));
  assert.equal(response.status, 201);
  assert.equal(stored.note, '测试收件人');
  assert.equal((await response.json()).note, '测试收件人');
});

test('admin can update, clear, and list an invitation note', async () => {
  const id = 'c'.repeat(64);
  const calls = [];
  const row = { maxUses: 3, uses: 2, expiresAt: 0, disabled: true, note: '测试收件人' };
  redisQueue([1, ['0', [`busvisa:invite:${id}`]], [JSON.stringify(row)], 1, 0], args => calls.push(args));
  const saveNote = note => gateway(request(`/api/admin/invites/${id}/note`, {
    method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ note })
  }));
  assert.equal((await saveNote('  测试收件人  ')).status, 204);
  assert.deepEqual(calls[0], ['EVAL', UPDATE_INVITE_NOTE, 1, `busvisa:invite:${id}`, '测试收件人']);
  const list = await gateway(request('/api/admin/invites', { headers: auth }));
  assert.deepEqual((await list.json()).invites[0], { id, ...row });
  assert.equal((await saveNote('')).status, 204);
  assert.equal(calls[3][4], '');
  assert.equal((await saveNote('gone')).status, 404);
});

test('note updates require admin authorization and validate their input', async () => {
  const route = `/api/admin/invites/${'d'.repeat(64)}/note`;
  redisQueue([2], args => assert.equal(args[0], 'INCR'));
  assert.equal((await gateway(request(route, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{"note":"test"}'
  }))).status, 401);
  globalThis.fetch = () => { throw new Error('invalid requests must not access Redis'); };
  for (const input of [null, [], {}, { note: 42 }, { note: 'x'.repeat(201) }]) {
    const response = await gateway(request(route, {
      method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input)
    }));
    assert.equal(response.status, 400);
  }
  assert.equal((await gateway(request(route, {
    method: 'POST', headers: { ...auth, Origin: 'https://other.test', 'Content-Type': 'application/json' }, body: '{"note":"test"}'
  }))).status, 403);
  assert.equal((await gateway(request(route, { method: 'POST', headers: { ...auth, Origin: origin }, body: '{}' }))).status, 415);
  assert.equal((await gateway(request(route, { headers: { ...auth, Origin: origin } }))).status, 405);
});

test('admin API validates origins, cursors, content type, and invite limits', async () => {
  globalThis.fetch = () => { throw new Error('should not access Redis'); };
  const crossOrigin = request('/api/admin/invites', {
    method: 'POST', headers: { ...auth, Origin: 'https://other.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxUses: 1, validDays: 1 })
  });
  assert.equal((await gateway(crossOrigin)).status, 403);
  assert.equal((await gateway(request('/api/admin/invites?cursor=bad', { headers: auth }))).status, 400);
  assert.equal((await gateway(request('/api/admin/invites', { method: 'POST', headers: { ...auth, Origin: origin }, body: '{}' }))).status, 415);
  for (const input of [null, [], { maxUses: 1, validDays: 1, note: 1 }, { maxUses: 1, validDays: 1, note: 'x'.repeat(201) }, { maxUses: 1, permanent: 'true' }, { maxUses: 1, permanent: false }, { maxUses: 0, permanent: true }, { maxUses: 0, validDays: 1 }, { maxUses: 1, validDays: 366 }, { maxUses: 1.5, validDays: 1 }]) {
    const response = await gateway(request('/api/admin/invites', {
      method: 'POST', headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input)
    }));
    assert.equal(response.status, 400);
  }
});
