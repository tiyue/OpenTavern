import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(fs.existsSync(path.join(root, 'dist/server/index.js')), true, 'Sites worker bundle is missing');
const hostingConfig = JSON.parse(read('.openai/hosting.json'));
assert.deepEqual(JSON.parse(read('dist/.openai/hosting.json')), hostingConfig);
assert.equal(typeof hostingConfig.project_id, 'string');
assert.equal(hostingConfig.d1, 'DB');
assert.equal(hostingConfig.r2, null);

const migrationDirectory = path.join(root, 'dist/.openai/drizzle');
const migrationFiles = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql'));
assert.equal(migrationFiles.length > 0, true, 'Sites build should package at least one D1 migration');
const migrationSql = migrationFiles.map((name) => read(`dist/.openai/drizzle/${name}`)).join('\n');
for (const table of ['opentavern_sync', 'opentavern_sync_v2_meta', 'opentavern_sync_v2_chunks', 'opentavern_sync_v2_locks']) {
  assert.match(migrationSql, new RegExp(`CREATE TABLE [^;]*${table}`, 'i'), `D1 migration is missing ${table}`);
}

const html = read('dist/client/opentavern.html');
const offlineManifest = JSON.parse(read('dist/client/offline-manifest.json'));
const shellTransport = read(`dist/client/assets/offline/${offlineManifest.releaseId}/index.html.txt`);
assert.equal(shellTransport, html, 'Sites must package the exact pinned shell as a plain-text transport copy');
assert.match(html, /assets\/css\/tailwind\.css/);
assert.match(html, /assets\/js\/purify\.min\.js/);
assert.match(html, /assets\/js\/marked\.umd\.js/);
assert.equal(read('assets/js/marked.umd.js'), read('node_modules/marked/lib/marked.umd.js'), 'Vendored Markdown parser must match the locked dependency');
assert.equal(read('dist/client/assets/js/marked.umd.js'), read('assets/js/marked.umd.js'), 'Sites must package the same Markdown parser');
assert.match(html, /assets\/images\/opentavern-og\.png/);
assert.doesNotMatch(html, /cdn\.tailwindcss\.com|cdn\.jsdelivr\.net/);
assert.equal(
  fs.existsSync(path.join(root, 'dist/client/assets/images/opentavern-og.png')),
  true,
  'Sites build should package the social preview image',
);

const workerConfig = JSON.parse(read('dist/server/wrangler.json'));
assert.equal(workerConfig.compatibility_date, '2026-05-22');
assert.equal(workerConfig.assets.binding, 'ASSETS');
assert.equal(workerConfig.assets.run_worker_first, true);
assert.equal(workerConfig.assets.html_handling, 'none');
assert.equal(workerConfig.d1_databases?.length, 1);
assert.equal(workerConfig.d1_databases[0].binding, 'DB');

const workerBundle = read('dist/server/index.js');
assert.match(workerBundle, /\/api\/sync/);
assert.match(workerBundle, /opentavern-sync/);

const catalog = read('src/app/library/60-public-card-data.js');
const assetPattern = /"(?:coverImage|previewImage|jsonUrl)"\s*:\s*"([^"]+)"/g;
const referencedAssets = new Set();
for (const match of catalog.matchAll(assetPattern)) {
  referencedAssets.add(decodeURIComponent(match[1].replace(/^\/+/, '')));
}
for (const relativePath of referencedAssets) {
  assert.equal(
    fs.existsSync(path.join(root, 'dist/client', relativePath)),
    true,
    `Sites build is missing public card asset: ${relativePath}`,
  );
}

console.log(`Sites build checks passed: ${referencedAssets.size} referenced card assets packaged.`);
