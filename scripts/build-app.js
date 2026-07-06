import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'app');
const manifestPath = path.join(srcDir, 'manifest.json');
const outPath = path.join(root, 'assets', 'js', 'app.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s*$/, '\n');
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const parts = manifest.map((fileName) => {
    const filePath = path.join(srcDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing app source chunk: ${fileName}`);
    }
    return readText(filePath);
  });

  const bundle = parts.join('').replace(/\s*$/, '\n');
  fs.writeFileSync(outPath, bundle, 'utf8');
  console.log(`Built ${path.relative(root, outPath)} from ${manifest.length} chunks.`);
}

main();
