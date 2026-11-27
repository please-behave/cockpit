import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { respond } from './fixtures.mjs';
import { reviewCases } from './review-cases.mjs';

const dist = join(import.meta.dirname, '../../dist/preview');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const pages = new Map([
  ['/sign-in', 'sign-in.html'],
  ['/preview/repository-map', 'repository-map-preview.html'],
]);
const reviewFiles = new Map([
  ['/preview/review', ['review.html', 'text/html; charset=utf-8']],
  ['/preview/review.css', ['review.css', 'text/css']],
  ['/preview/review.mjs', ['review.mjs', 'text/javascript']],
  ['/preview/review-metrics.mjs', ['review-metrics.mjs', 'text/javascript']],
]);
const host = '127.0.0.1';
const port = Number(process.env.PREVIEW_PORT ?? 8090);

async function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

async function serve(request, response) {
  const { pathname } = new URL(request.url, `http://${host}`);
  if (pathname === '/preview/review-cases.json') {
    return send(response, 200, 'application/json', JSON.stringify(reviewCases));
  }
  const reviewFile = reviewFiles.get(pathname);
  if (reviewFile) {
    const [file, type] = reviewFile;
    return send(response, 200, type, await readFile(join(import.meta.dirname, file)));
  }

  const fixture = respond(request.url);
  if (fixture) {
    if (fixture.delay) await setTimeout(fixture.delay);
    return send(response, fixture.status, 'application/json', JSON.stringify(fixture.body));
  }

  if (pathname.startsWith('/assets/')) {
    const file = normalize(join(dist, pathname));
    if (!file.startsWith(join(dist, 'assets'))) return send(response, 404, 'text/plain', 'not found');
    return send(response, 200, types[extname(file)] ?? 'application/octet-stream', await readFile(file));
  }
  const page = pages.get(pathname) ?? 'index.html';
  return send(response, 200, 'text/html; charset=utf-8', await readFile(join(dist, page)));
}

createServer((request, response) => {
  serve(request, response).catch(error => {
    const missing = error?.code === 'ENOENT';
    send(response, missing ? 404 : 500, 'text/plain', missing ? 'not found; run "mise run preview"' : 'error');
  });
}).listen(port, host, () => console.log(`Preview with fixture data at http://${host}:${port}/`));
