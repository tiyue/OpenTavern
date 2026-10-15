import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src/ui');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));

const artifacts = [['html', 'index.html'], ['css', 'assets/css/app.css']].map(([kind, output]) => {
  const parts = manifest[kind].map(file => fs.readFileSync(path.join(source, kind, file)));
  return { kind, output, parts };
});

for (const { kind, output, parts } of artifacts) {
  fs.writeFileSync(path.join(root, output), Buffer.concat(parts));
  console.log(`Built ${output} from ${parts.length} ${kind} parts.`);
}
