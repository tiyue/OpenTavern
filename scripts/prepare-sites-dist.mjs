import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'drizzle');
const target = path.join(root, 'dist', '.openai', 'drizzle');
if (!target.startsWith(path.join(root, 'dist', '.openai') + path.sep)) {
  throw new Error('Refusing to copy Sites migrations outside dist/.openai.');
}

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

console.log('Copied D1 migrations into the Sites deployment artifact.');
