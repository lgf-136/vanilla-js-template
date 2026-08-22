import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';

const require = createRequire(import.meta.url);
const { handleRequest } = require('../app.js');
const { MIME } = require('../core/http/mime.js');
const { isPublicAsset } = require('../core/http/allowed.js');
const { SECURITY_HEADERS } = require('../core/http/headers.js');
const ROOT = new URL('../../', import.meta.url);

function envObject() {
  const env = Object.fromEntries(Deno.env.entries());
  if (!env.DB_DRIVER && !env.DATABASE_URL) env.DB_DRIVER = 'sqlite';
  return env;
}

async function staticResponse(request, pathname) {
  if (!isPublicAsset(pathname)) return new Response('Not Found', { status: 404 });
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const fileUrl = new URL(relative, ROOT);
  const filePath = normalize(fileUrl.pathname);
  if (!filePath.startsWith(normalize(new URL(ROOT).pathname))) return new Response('Forbidden', { status: 403 });
  try {
    const data = await Deno.readFile(fileUrl);
    return new Response(data, {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': pathname === '/' || pathname === '/index.html' ? 'no-store' : 'public, no-cache',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

async function handler(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return handleRequest(request, envObject());
  }
  return staticResponse(request, url.pathname);
}

Deno.serve({ hostname: '0.0.0.0', port: Number(Deno.env.get('PORT') || 8000) }, handler);
