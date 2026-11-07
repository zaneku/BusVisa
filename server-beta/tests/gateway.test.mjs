import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import gateway from '../netlify/functions/gateway.mjs';
import { digest, CHECK_SESSION, REDEEM } from '../netlify/lib/store.mjs';

process.env.INVITE_HASH_SECRET = 'local-test-secret-32-characters-long';
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const origin = 'https://busvisa.test';
const attemptId = 'a'.repeat(64);
const cookie = '__Host-busvisa_session=' + 'b'.repeat(64);

function request(route = '/', options = {}) {
  return new Request(origin + route, options);
}

function redeem(code = 'new-test-code', extra = {}) {
  return request('/api/invite/redeem', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, attemptId, ...extra })
  });
}

function redisResult(result, inspect = () => {}) {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://redis.invalid');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    inspect(JSON.parse(options.body));
    return Response.json({ result });
  };
}

test('unauthenticated root serves the invitation UI without application markup', async () => {
  const response = await gateway(request());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /id="beta-form"/);
  assert.doesNotMatch(html, /id="world-svg"|busvisa-unlocked|localStorage.getItem/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('legacy browser flag and forged cookies cannot authorize protected resources', async () => {
  for (const route of ['/app.js', '/data/china-rules.json', '/policy-api/index.json', '/fx-api/usd/cny']) {
    assert.equal((await gateway(request(route, { headers: { Cookie: 'busvisa.beta.access.v1=yes' } }))).status, 401);
  }
});

test('missing or expired sessions are rejected', async () => {
  redisResult(0);
  assert.equal((await gateway(request('/app.js', { headers: { Cookie: cookie } }))).status, 401);
});

test('valid session reads application and JSON through session validation', async () => {
  redisResult(1, args => assert.equal(args[1], CHECK_SESSION));
  const response = await gateway(request('/data/china-rules.json', { headers: { Cookie: cookie } }));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).countries);
  const app = await gateway(request('/', { headers: { Cookie: cookie } }));
  const html = await app.text();
  assert.match(html, /id="world-svg"/);
  assert.doesNotMatch(html, /id="beta-gate"|busvisa.beta.access.v1/);
});

test('redemption sets secure HttpOnly cookie and hashes secrets before persistence', async () => {
  redisResult([200], args => {
    assert.equal(args[1], REDEEM);
    assert.equal(args[2], 3);
    assert.equal(args[3], `busvisa:rate:${digest('test-ip')}`);
    assert.equal(args[4], `busvisa:invite:${digest('new-test-code')}`);
    assert.equal(args[5], `busvisa:session:${digest(digest(`session:${attemptId}`))}`);
    assert.ok(!JSON.stringify(args).includes('new-test-code'));
  });
  const response = await gateway(redeem(), { ip: 'test-ip' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800/);
});

test('retries reuse the same server session key', async () => {
  const keys = [];
  redisResult([200], args => keys.push(args[5]));
  await gateway(redeem());
  await gateway(redeem());
  assert.equal(keys[0], keys[1]);
});

test('invalid invitations and rate limits do not issue cookies', async () => {
  for (const status of [401, 429]) {
    redisResult([status]);
    const response = await gateway(redeem());
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '900');
  }
});

test('cross-origin and malformed requests are rejected before Redis access', async () => {
  globalThis.fetch = () => { throw new Error('must not access Redis'); };
  const crossOrigin = redeem();
  crossOrigin.headers.set('Origin', 'https://other.test');
  assert.equal((await gateway(crossOrigin)).status, 403);
  assert.equal((await gateway(redeem('', { attemptId }))).status, 400);
  assert.equal((await gateway(redeem('test', { attemptId: '' }))).status, 400);
  assert.equal((await gateway(request('/api/invite/redeem'))).status, 405);
});

test('Redis outages fail closed for redemption and authenticated reads', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await gateway(redeem())).status, 503);
  assert.equal((await gateway(request('/app.js', { headers: { Cookie: cookie } }))).status, 503);
});

test('private implementation files and traversal paths cannot be downloaded', async () => {
  redisResult(1);
  for (const route of ['/netlify/lib/store.mjs', '/.env', '/private/index.html', '/data/%2e%2e%2findex.html']) {
    assert.equal((await gateway(request(route, { headers: { Cookie: cookie } }))).status, 404);
  }
});

test('retirement worker cleans up old application caches', async () => {
  const response = await gateway(request('/sw.js'));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /caches.delete.*registration.unregister/s);
});

test('public login code contains no hardcoded invitation verifier', async () => {
  const js = await readFile('public/beta-gate.js', 'utf8');
  assert.doesNotMatch(js, /EXPECTED_SHA256|subtle.digest|setItem\(KEY/);
  assert.match(js, /\/api\/invite\/redeem/);
});
