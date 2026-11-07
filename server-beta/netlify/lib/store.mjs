import { createHmac } from 'node:crypto';

export function digest(value) {
  const secret = process.env.INVITE_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Invite secret is missing');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export async function command(...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.startsWith('https://') || !token) throw new Error('Redis configuration is missing');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Redis unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Redis command failed');
  return data.result;
}

// Update the note atomically so concurrent redemptions and revocations keep their fields.
export const UPDATE_INVITE_NOTE = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local invite = cjson.decode(value)
invite.note = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(invite), 'KEEPTTL')
return 1
`;

// Redemption and session creation commit together. Repeating the same request
// with its existing session cannot consume a second invitation use.
export const REDEEM = `
local attempts = redis.call('INCR', KEYS[1])
if attempts == 1 then redis.call('EXPIRE', KEYS[1], 900) end
if attempts > 10 then return {429} end
local invite = redis.call('GET', KEYS[2])
if not invite then return {401} end
local row = cjson.decode(invite)
local now = tonumber(ARGV[1])
if row.disabled or (row.expiresAt ~= 0 and row.expiresAt <= now) then return {401} end
local existing = redis.call('GET', KEYS[3])
if existing then
  local session = cjson.decode(existing)
  if session.inviteKey == KEYS[2] then return {200} end
end
if row.uses >= row.maxUses then return {401} end
row.uses = row.uses + 1
local ttl = 604800
if row.expiresAt ~= 0 then ttl = math.min(ttl, row.expiresAt - now) end
redis.call('SET', KEYS[2], cjson.encode(row), 'KEEPTTL')
redis.call('SET', KEYS[3], cjson.encode({inviteKey=KEYS[2]}), 'EX', ttl)
return {200}
`;

export const CHECK_SESSION = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local session = cjson.decode(value)
local value = redis.call('GET', session.inviteKey)
if not value then return 0 end
local invite = cjson.decode(value)
if invite.disabled or (invite.expiresAt ~= 0 and invite.expiresAt <= tonumber(ARGV[1])) then return 0 end
return 1
`;
