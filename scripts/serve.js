// Minimal static server for local review. Camera access needs a secure
// context, and http://localhost counts as one.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

export function createApp({ directory = root } = {}) {
 return createServer(async (req, res) => {
  const authorities = new Set(['localhost', '127.0.0.1', '[::1]'].map(host => `${host}:${req.socket.localPort}`));
  if (!authorities.has(req.headers.host) || (req.headers.origin && !authorities.has(req.headers.origin.replace(/^http:\/\//, '')))) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const parts = pathname.split('/');
  const publicPath = ['/index.html', '/main.js', '/style.css'].includes(pathname) || /^\/(assets|utils)\//.test(pathname);
  if (!publicPath || pathname.includes('\\') || parts.some(part => part.startsWith('.')) || !types[extname(pathname)]) {
    res.writeHead(403).end();
    return;
  }
  try {
    const canonicalRoot = await realpath(directory);
    const file = await realpath(resolve(canonicalRoot, '.' + pathname));
    const inside = relative(canonicalRoot, file);
    if (inside.startsWith('..' + sep) || inside === '..' || isAbsolute(inside)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      // Dev server: always serve the latest edits, never a cached module.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }).end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) createApp().listen(port, '127.0.0.1', () => {
  console.log(`CamCam running at http://localhost:${port}`);
});
