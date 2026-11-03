import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../scripts/serve.js';

test('local server isolates public assets and rejects foreign authorities', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'camera-server-'));
 const server = createApp({ directory });
 try {
  await mkdir(join(directory, 'assets'));
  await mkdir(join(directory, '.git'));
  await writeFile(join(directory, 'index.html'), '<p>Public fixture</p>');
  await writeFile(join(directory, '.git', 'HEAD'), 'private fixture');
  await writeFile(join(directory, 'assets', 'image.svg'), '<svg/>');
  await writeFile(join(directory, 'assets', '.private.txt'), 'private fixture');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
   const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
    let body = ''; res.setEncoding('utf8'); res.on('data', data => body += data);
    res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
   }); req.on('error', reject); req.end();
  });
  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/assets/image.svg')).status, 200);
  assert.equal((await get('/', {}, 'HEAD')).body, '');
  for (const path of ['/.git/HEAD', '/package.json', '/scripts/serve.js', '/assets/.private.txt', '/assets/%2eprivate.txt', '/assets/..%5c.git/HEAD']) assert.notEqual((await get(path)).status, 200, path);
  assert.equal((await get('/', { Host: `foreign.example:${port}` })).status, 403);
  assert.equal((await get('/', { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await get('/', { Origin: `http://localhost:${port}` })).status, 200);
  assert.equal((await get('/', {}, 'POST')).status, 405);
  assert.equal((await get('/%XX')).status, 400);
  assert.equal((await get('/')).headers['x-content-type-options'], 'nosniff');
 } finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
 }
});

test('public asset symlinks cannot serve outside the public directory', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'camera-symlink-'));
 const server = createApp({ directory: join(directory, 'public') });
 try {
  await mkdir(join(directory, 'public', 'assets'), { recursive: true });
  await writeFile(join(directory, 'outside.svg'), 'outside fixture');
  await symlink(directory, join(directory, 'public', 'assets', 'escape'), 'junction');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/assets/escape/outside.svg`);
  assert.equal(response.status, 403);
 } finally {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
 }
});
