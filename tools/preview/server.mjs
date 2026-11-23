import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { respond } from './fixtures.mjs';

const dist = join(import.meta.dirname, '../../frontend/dist');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const host = '127.0.0.1';
const port = Number(process.env.PREVIEW_PORT ?? 8090);

async function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function serve(request, response) {
  const { pathname } = new URL(request.url, `http://${host}`);
  const fixture = respond(request.url);
  if (fixture) return send(response, fixture.status, 'application/json', JSON.stringify(fixture.body));

  if (pathname.startsWith('/assets/')) {
    const file = normalize(join(dist, pathname));
    if (!file.startsWith(join(dist, 'assets'))) return send(response, 404, 'text/plain', 'not found');
    return send(response, 200, types[extname(file)] ?? 'application/octet-stream', await readFile(file));
  }
  const page = pathname === '/sign-in' ? 'sign-in.html' : 'index.html';
  return send(response, 200, 'text/html; charset=utf-8', await readFile(join(dist, page)));
}

createServer((request, response) => {
  serve(request, response).catch(error => {
    const missing = error?.code === 'ENOENT';
    send(response, missing ? 404 : 500, 'text/plain', missing ? 'not found; run "mise run frontend-build" first' : 'error');
  });
}).listen(port, host, () => console.log(`Preview with fixture data at http://${host}:${port}/`));
