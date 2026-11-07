import { randomBytes } from 'node:crypto';
import { command, digest } from '../netlify/lib/store.mjs';

const [action, value, days = '14'] = process.argv.slice(2);
if (action === 'create') {
  const maxUses = Number(value || 1);
  const permanent = days === 'permanent';
  const validDays = Number(days);
  if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10000 ||
      (!permanent && (!Number.isSafeInteger(validDays) || validDays < 1 || validDays > 365))) {
    throw new Error('Usage: npm run invite -- create [maxUses=1] [days=14|permanent]');
  }
  const code = `BV-${randomBytes(18).toString('base64url')}`;
  const id = digest(code);
  const expiresAt = permanent ? 0 : Math.floor(Date.now() / 1000) + validDays * 86400;
  const row = { maxUses, uses: 0, expiresAt, disabled: false };
  await command('SET', `busvisa:invite:${id}`, JSON.stringify(row), ...(permanent ? [] : ['EXAT', expiresAt]), 'NX');
  console.log(JSON.stringify({ code, id, maxUses, expiresAt: permanent ? 'permanent' : new Date(expiresAt * 1000).toISOString() }, null, 2));
} else if (['disable', 'status'].includes(action) && /^[a-f0-9]{64}$/.test(value || '')) {
  const key = `busvisa:invite:${value}`;
  if (action === 'status') {
    console.log(await command('GET', key));
  } else {
    const script = `local v=redis.call('GET',KEYS[1]);if not v then return 0 end;local r=cjson.decode(v);r.disabled=true;redis.call('SET',KEYS[1],cjson.encode(r),'KEEPTTL');return 1`;
    console.log(await command('EVAL', script, 1, key) ? 'Disabled, including existing sessions.' : 'Invitation not found.');
  }
} else {
  console.log('Create: npm run invite -- create [maxUses=1] [days=14|permanent]');
  console.log('Inspect: npm run invite -- status <id>');
  console.log('Revoke: npm run invite -- disable <id>');
  process.exitCode = 1;
}
