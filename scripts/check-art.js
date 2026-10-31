// Lists which files in assets/summon/ the app loads and which it never uses,
// so only the needed artwork gets committed. Reads only; deletes nothing.
// The needed set mirrors utils/summonArt.js: the two flame sprites,
// sprites/sprites.json, and every sheet its run, bite and carry clips name.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const dir = resolve(import.meta.dirname, '..', 'assets', 'summon');
const needed = new Set(['flame-c.webp', 'flame-d.webp', 'sprites/sprites.json']);

async function listFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

let present;
try {
  present = (await listFiles(dir)).map((path) => relative(dir, path).split(sep).join('/'));
} catch {
  console.log('No assets/summon/ folder: the app runs with drawn flames and no fox.');
  process.exit(0);
}

try {
  const manifest = JSON.parse(await readFile(join(dir, 'sprites', 'sprites.json'), 'utf8'));
  for (const clip of [...(manifest.run ?? []), ...(manifest.bite ?? []), ...(manifest.carry ?? [])]) {
    needed.add(`sprites/${clip.sheet}`);
  }
} catch (error) {
  console.log(`Could not read sprites/sprites.json (${error.message}); only the fixed files are listed as needed.`);
}

const have = new Set(present);
const missing = [...needed].filter((file) => !have.has(file)).sort();
const unused = present.filter((file) => !needed.has(file)).sort();

console.log(`Needed (${needed.size}):`);
for (const file of [...needed].sort()) console.log(`  ${have.has(file) ? 'ok     ' : 'MISSING'} ${file}`);
console.log(`\nNot used by the app (${unused.length}):`);
for (const file of unused) console.log(`  ${file}`);
if (!unused.length) console.log('  none');

process.exitCode = missing.length ? 1 : 0;
