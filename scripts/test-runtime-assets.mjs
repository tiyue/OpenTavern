/**
 * 本地运行资源测试：入口不得再引用任何外部 CDN，锁定 vendor 字节与依赖保持一致，
 * 入口必须是离线清单生成的“固定版本”字节（相对引用指向不可变快照），
 * 且普通源码入口与 Sites 使用同一份本地资源。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOfflineManifest, sha256Hex } from './build-offline-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const entrySource = read('src/ui/html/00-document-start.html');
assert.doesNotMatch(entrySource, /cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|unpkg\.com/i, 'Entry source must not reference any CDN.');
assert.match(entrySource, /assets\/css\/tailwind\.css/, 'Entry source must load the local Tailwind stylesheet.');
assert.match(entrySource, /assets\/js\/purify\.min\.js/, 'Entry source must load the locked local DOMPurify.');
assert.match(entrySource, /id="ot-runtime-config"/, 'Entry source must expose the runtime config placeholder.');
// 不可变快照已提供缓存失效，入口不再需要手工版本查询参数。
assert.match(entrySource, /<script src="assets\/js\/marked\.umd\.js"><\/script>/, 'Entry source must drop the manual marked query-release.');
assert.match(entrySource, /<link rel="stylesheet" href="assets\/css\/app\.css">/, 'Entry source must drop the manual stylesheet query-release.');

const documentEnd = read('src/ui/html/99-document-end.html');
assert.match(documentEnd, /assets\/js\/vendor\/js-sha256-1\.0\.0\.min\.js/, 'Entry must use the locked local SHA-256 vendor.');
assert.match(documentEnd, /integrity="sha256-[^"]+"/, 'Entry must preserve SRI on the SHA-256 vendor.');
assert.match(documentEnd, /<script src="assets\/js\/app\.js"><\/script>/, 'Entry must drop the manual app query-release.');
assert.doesNotMatch(documentEnd, /https?:\/\//i, 'Entry end must not reference any remote script.');

// 装配后的入口源同样必须只使用本地资源。
const uiManifest = JSON.parse(read('src/ui/manifest.json'));
const assembledEntry = uiManifest.html.map((file) => read(`src/ui/html/${file}`)).join('');
assert.doesNotMatch(assembledEntry, /https:\/\/cdn\./i, 'Assembled entry must not reference any CDN.');
assert.match(assembledEntry, /href="assets\/css\/tailwind\.css"/);
assert.match(assembledEntry, /src="assets\/js\/purify\.min\.js"/);

// 入口必须是 build-offline-manifest 的纯计算产物（write:false），并落到不可变快照。
const result = await buildOfflineManifest({ root, write: false });
const releaseDir = path.join(root, 'assets', 'offline', result.releaseId);
assert.match(read('index.html'), new RegExp(`data-release="${result.releaseId}"`), 'index.html must pin the release id (run npm run build).');
assert.match(read('index.html'), new RegExp(`src="assets/offline/${result.releaseId}/assets/js/app.js"`), 'index.html must reference the immutable snapshot scripts.');
assert.match(read('index.html'), new RegExp(`href="assets/offline/${result.releaseId}/assets/css/tailwind.css"`), 'index.html must reference the immutable snapshot stylesheet.');
assert.equal(read('index.html'), result.entryHtml, 'index.html must equal the pinned entry computed from src/ui sources.');
assert.equal(fs.readFileSync(path.join(releaseDir, 'index.html'), 'utf8'), result.entryHtml, 'The snapshot shell must equal the pinned entry.');
assert.deepEqual(JSON.parse(read('offline-manifest.json')), result.manifest, 'The published manifest must match the computed manifest.');
assert.equal(fs.existsSync(path.join(root, 'opentavern-sw.js')), true, 'The offline Service Worker must be published at the root.');

// 独立路径/摘要断言：清单每个核心条目在快照里都逐字节匹配，且包含新版 ESM 镜像。
for (const entry of result.manifest.core) {
  const bytes = fs.readFileSync(path.join(releaseDir, entry.path));
  assert.equal(bytes.length, entry.bytes, `snapshot bytes must match the manifest for ${entry.path}`);
  assert.equal(sha256Hex(bytes), entry.sha256, `snapshot sha256 must match the manifest for ${entry.path}`);
}
for (const relative of ['assets/js/vendor/vue-3.5.43.esm-browser.prod.js', 'assets/js/vendor/js-yaml-4.1.1.mjs']) {
  assert.ok(result.manifest.core.some((entry) => entry.path === relative), `${relative} must be part of the offline core snapshot.`);
}

// 锁定 vendor 字节一致性：marked 已入库，purify 由 prepare-runtime-assets 复制。
assert.deepEqual(
  fs.readFileSync(path.join(root, 'assets/js/marked.umd.js')),
  fs.readFileSync(path.join(root, 'node_modules/marked/lib/marked.umd.js')),
  'Vendored Markdown parser must equal the locked dependency.',
);
const purifyOutput = path.join(root, 'assets/js/purify.min.js');
if (fs.existsSync(purifyOutput)) {
  assert.deepEqual(
    fs.readFileSync(purifyOutput),
    fs.readFileSync(path.join(root, 'node_modules/dompurify/dist/purify.min.js')),
    'Generated DOMPurify copy must equal the locked dependency.',
  );
}

// 新版 ESM 镜像必须与登记摘要一致（供卡片运行时按固定 URL 命中本地镜像）。
const vendors = JSON.parse(read('assets/js/vendor/card-runtime-vendors.json'));
for (const name of ['vue-esm', 'js-yaml-esm']) {
  const vendor = vendors.find((item) => item.name === name);
  assert.ok(vendor, `Vendor registry must register ${name}.`);
  assert.equal(vendor.format, 'module', `${name} must keep its ESM format.`);
  assert.equal(sha256Hex(fs.readFileSync(path.join(root, vendor.path))), vendor.sha256, `${name} mirror bytes must match the pinned digest.`);
}

// Sites 使用同一份 assets：构建脚本只复制并生成同一固定入口，不再做 CDN 字符串替换。
const sitesScript = read('scripts/prepare-sites-public.mjs');
assert.doesNotMatch(sitesScript, /cdn\.tailwindcss\.com|cdn\.jsdelivr\.net/, 'Sites preparation must not match CDN inputs.');
assert.match(sitesScript, /buildOfflineManifest/, 'Sites preparation must build its own offline manifest.');
if (fs.existsSync(path.join(root, '.sites-public/opentavern.html'))) {
  assert.equal(read('.sites-public/opentavern.html') === result.entryHtml, true, 'Sites must emit the same pinned entry bytes.');
  const manifest = JSON.parse(read('.sites-public/offline-manifest.json'));
  assert.ok(manifest.core.some(entry => entry.path === 'index.html' && entry.mime === 'text/html'), 'Both entries must share the canonical offline navigation shell.');
}
const packageJson = JSON.parse(read('package.json'));
assert.match(packageJson.scripts.build, /prepare-runtime-assets/, 'The package build must prepare local runtime assets first.');
assert.match(packageJson.scripts.build, /build-offline-manifest\.mjs/, 'The package build must end with offline packaging.');
assert.match(packageJson.scripts['build:app'], /prepare-runtime-assets/);
assert.match(packageJson.scripts['build:app'], /build-offline-manifest\.mjs/, 'The app build must also end with offline packaging.');
assert.equal(packageJson.scripts['prepare:sites'], 'node scripts/prepare-sites-public.mjs');

console.log('Runtime asset checks passed: local-only entry, pinned immutable snapshot bytes and shared Sites assets.');
