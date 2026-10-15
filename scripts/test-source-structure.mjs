import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = path.join(root, 'src/app');
const manifest = JSON.parse(fs.readFileSync(path.join(appSource, 'manifest.json'), 'utf8'));
const files = fs.readdirSync(appSource, { recursive: true }).filter(file => file.endsWith('.js')).map(file => file.replaceAll('\\', '/'));
assert.equal(new Set(manifest).size, manifest.length, 'App manifest cannot contain duplicate chunks.');
assert.deepEqual([...manifest].sort(), files.sort(), 'App manifest must cover all business source files.');
assert.ok(manifest.every(file => file.includes('/')), 'App chunks must live in business directories.');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opentavern-structure-test-'));
assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
assert.ok(path.basename(fixture).startsWith('opentavern-structure-test-'));
const write = (file, data) => {
  const target = path.join(fixture, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
};
const run = file => spawnSync(process.execPath, [path.join(fixture, 'scripts', file)], { cwd: fixture, encoding: 'utf8' });
try {
  for (const file of ['build-app.js', 'build-ui.mjs', 'check-bundle-drift.js']) {
    write('scripts/' + file, fs.readFileSync(path.join(root, 'scripts', file)));
  }
  write('scripts/check-app-contracts.mjs', 'export function checkAppContracts() { return []; }\n');
  write('src/app/manifest.json', '["bootstrap.js","prompt/40-regex-worker-runtime.js"]');
  write('src/app/bootstrap.js', '(function () {})();\n');
  const workerSource = fs.readFileSync(path.join(root, 'assets/js/regex-worker.js'), 'utf8');
  write('src/app/prompt/40-regex-worker-runtime.js', fs.readFileSync(path.join(root, 'src/app/prompt/40-regex-worker-runtime.js'), 'utf8'));
  write('assets/js/regex-worker.js', workerSource);
  write('src/ui/manifest.json', JSON.stringify({ html: ['start.html', 'end.html'], css: ['tokens.css', 'rules.css'] }));
  const html = '<main>\r\n中文</main>\n', css = ':root { --ink: #222; }\r\nmain { color: var(--ink); }\n';
  write('src/ui/html/start.html', '<main>\r\n');
  write('src/ui/html/end.html', '中文</main>\n');
  write('src/ui/css/tokens.css', ':root { --ink: #222; }\r\n');
  write('src/ui/css/rules.css', 'main { color: var(--ink); }\n');
  write('assets/js/app.js', '');
  write('assets/css/app.css', '');
  assert.equal(run('build-app.js').status, 0);
  const bundle = fs.readFileSync(path.join(fixture, 'assets/js/app.js'), 'utf8');
  assert.ok(
    bundle.includes(`var REGEX_WORKER_SOURCE = ${JSON.stringify(workerSource.replace(/\s*$/, '\n'))};`),
    'The app bundle must embed the canonical regex worker source verbatim.'
  );
  assert.equal(bundle.split('@@REGEX_WORKER_SOURCE@@').length - 1, 1, 'The runtime placeholder must resolve exactly once.');
  assert.doesNotThrow(() => new Function(bundle), 'The embedded worker source must not break bundle parsing.');
  assert.equal(run('build-ui.mjs').status, 0);
  assert.equal(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(path.join(fixture, 'assets/css/app.css'), 'utf8'), css);
  assert.equal(run('check-bundle-drift.js').status, 0);

  for (const [file, original] of [['index.html', html], ['assets/css/app.css', css]]) {
    write(file, original + 'drift');
    const failure = run('check-bundle-drift.js');
    assert.equal(failure.status, 1);
    assert.ok(failure.stderr.includes(`UI drift detected: ${file}`));
    assert.equal(fs.readFileSync(path.join(fixture, file), 'utf8'), original + 'drift', 'Drift checks cannot overwrite the current artifact.');
    write(file, original);
  }
  write('src/ui/html/start.html', 'changed');
  fs.unlinkSync(path.join(fixture, 'src/ui/css/rules.css'));
  assert.notEqual(run('build-ui.mjs').status, 0, 'Missing UI parts must reject the build.');
  assert.equal(fs.readFileSync(path.join(fixture, 'assets/css/app.css'), 'utf8'), css, 'A failed source read cannot partially write UI artifacts.');
  assert.equal(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), html);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
console.log('Source structure passed: complete manifest, exact UI assembly, drift rejection and missing-part failure.');
