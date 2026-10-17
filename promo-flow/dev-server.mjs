import './env.mjs';
import { createServer } from 'node:http';
import { readFile, watch } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { handleApi, bodyLimit } from './api-routes.mjs';

const root = resolve(import.meta.dirname, 'dist');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || (production ? 8080 : 4173));
const host = production ? '0.0.0.0' : '127.0.0.1';
const clients = new Set();
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const reloadScript = `<script>const events=new EventSource('/__dev/events');events.onmessage=()=>location.reload();</script>`;

async function readJSON(request, limit = 16000) {
  let size = 0, body = '';
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Request is too large');
    body += chunk;
  }
  try { return JSON.parse(body); }
  catch { throw new Error('Send valid JSON'); }
}

const server = createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }

  if (pathname.startsWith('/api/')) {
    const route = pathname.slice(5);
    let input = {};
    if (request.method === 'POST') {
      try { input = await readJSON(request, bodyLimit(route)); }
      catch (error) { response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: error.message })); return; }
    }
    await handleApi(route, request.method, input, response);
    return;
  }
  if (pathname === '/__dev/events' && !production) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    response.write(': connected\n\n');
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }

  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end('Forbidden'); return; }
  readFile(file, (error, contents) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('File unavailable'); return; }
    const isHtml = extname(file) === '.html';
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': production ? 'public, max-age=300' : 'no-store' });
    response.end(isHtml && !production ? contents.toString().replace('</body>', `${reloadScript}</body>`) : contents);
  });
});

const watcher = production ? null : watch(root, { recursive: true }, () => {
  for (const client of clients) client.write('data: reload\n\n');
});
server.listen(port, host, () => console.log(`PromoFlow ${production ? 'server' : 'dev server'}: http://localhost:${port}`));
process.on('SIGINT', () => { watcher?.close(); server.close(); process.exit(0); });
