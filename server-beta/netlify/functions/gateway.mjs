import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { command, digest, REDEEM, CHECK_SESSION } from '../lib/store.mjs';

const COOKIE = '__Host-busvisa_session';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon'
};
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY'
};

function reply(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...headers, ...extra } });
}

function sessionToken(request) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

export default async function handler(request, context = {}) {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const now = Math.floor(Date.now() / 1000);
    const token = sessionToken(request);

    if (pathname === '/api/invite/redeem') {
      if (request.method !== 'POST') return reply('', 405, { Allow: 'POST' });
      if (request.headers.get('origin') !== url.origin) return reply('', 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply('', 415);
      const body = await request.text();
      if (body.length > 1024) return reply('', 413);
      let input;
      try { input = JSON.parse(body); } catch { return reply('', 400); }
      if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 80) return reply('', 400);
      if (!/^[a-f0-9]{64}$/.test(input.attemptId || '')) return reply('', 400);
      const nextToken = digest(`session:${input.attemptId}`);
      // context.ip is supplied by Netlify, never trust a client forwarding header.
      const rateKey = `busvisa:rate:${digest(context.ip || 'unknown')}`;
      const result = await command('EVAL', REDEEM, 3, rateKey,
        `busvisa:invite:${digest(input.code.trim())}`,
        `busvisa:session:${digest(nextToken)}`, now);
      const status = Number(result[0]);
      if (status !== 200) return reply('', status, status === 429 ? { 'Retry-After': '900' } : {});
      return reply('', 200, {
        'Set-Cookie': `${COOKIE}=${nextToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`
      });
    }

    if (!['GET', 'HEAD'].includes(request.method)) return reply('', 405, { Allow: 'GET, HEAD' });

    // Replace the previous offline cache with a retiring worker for existing users.
    if (pathname === '/sw.js') {
      return reply(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('busvisa-'))await caches.delete(k);await self.registration.unregister();for(const c of await self.clients.matchAll({type:'window'}))await c.navigate(c.url)})()));`, 200,
        { 'Content-Type': types['.js'], 'Service-Worker-Allowed': '/' });
    }

    const valid = token && await command('EVAL', CHECK_SESSION, 1, `busvisa:session:${digest(token)}`, now);
    if (!valid) {
      if (pathname === '/' || pathname === '/index.html') {
        return reply(request.method === 'HEAD' ? null : await readFile(path.resolve('public/login.html')), 200, { 'Content-Type': types['.html'] });
      }
      return reply('', 401);
    }

    const proxy = proxyUrl(pathname);
    if (proxy) {
      const upstream = await fetch(proxy, { signal: AbortSignal.timeout(12000), redirect: 'error' });
      return reply(request.method === 'HEAD' ? null : upstream.body, upstream.status,
        { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    }

    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const allowed = /^(index\.html|app\.js|style\.css|policy-engine\.js|fee-engine\.js|country-search\.js|i18n\.js|theme\.js|manifest\.webmanifest|favicon\.ico|apple-touch-icon\.png|icons\/[a-z0-9-]+\.png|data\/[a-z0-9-]+\.json)$/;
    if (!allowed.test(relative)) return reply('', 404);
    const file = await readFile(path.resolve('private', relative));
    return reply(request.method === 'HEAD' ? null : file, 200, { 'Content-Type': types[path.extname(relative)] });
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof URIError) return reply('', 404);
    // Never log codes, cookie values, database credentials, or request bodies.
    console.error('BusVisa gateway unavailable');
    return reply('Service temporarily unavailable. Please try again.', 503);
  }
}

function proxyUrl(pathname) {
  if (['/policy-api/index.json', '/policy-api/visa-matrix.csv'].includes(pathname)) {
    return `https://travelrequirements.info/data/${pathname.split('/').pop()}`;
  }
  if (/^\/policy-api\/destinations\/[A-Za-z0-9_-]+\.json$/.test(pathname)) {
    return `https://travelrequirements.info/data/destinations/${pathname.split('/').pop()}`;
  }
  if (/^\/fx-api\/[A-Za-z]{3}\/[A-Za-z]{3}$/.test(pathname)) {
    return `https://api.frankfurter.dev/v2/rate/${pathname.slice('/fx-api/'.length)}`;
  }
  return null;
}
