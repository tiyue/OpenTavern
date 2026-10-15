/**
 * 离线清单构建的负向与确定性测试。
 *
 * 覆盖排序摘要推导的确定性 releaseId、非法路径/MIME/重复/缺失/字节/摘要拒绝，以及夹具构建：
 * 规范入口→固定版本字节、入口与别名同字节、核心副本路径、公共资料参与 releaseId、同输入复用、
 * 损坏同版本目录被整体替换、路径逃逸拒绝，以及失败时不发布清单/不留下半成品。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_ASSETS, buildOfflineManifest, computeReleaseId, isSafeRelativePath, mimeForPath, mimeMatches,
  sha256Hex, validateManifestEntries,
} from './build-offline-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 1) releaseId 只由排序后的输入摘要推导：顺序无关、内容相关、确定性。
const records = [
  { source: 'assets/js/app.js', sha256: sha256Hex(Buffer.from('app')), bytes: 3 },
  { source: 'assets/css/app.css', sha256: sha256Hex(Buffer.from('css')), bytes: 3 },
];
const idA = computeReleaseId(records);
const idB = computeReleaseId(records.slice().reverse());
assert.equal(idA, idB, 'releaseId must be independent of input order.');
const idC = computeReleaseId([...records, { source: 'extra.js', sha256: sha256Hex(Buffer.from('x')), bytes: 1 }]);
assert.notEqual(idA, idC, 'A changed input set must change releaseId.');
assert.match(idA, /^[0-9a-f]{24}$/, 'releaseId must be a 24-char hex digest.');

// 2) 路径安全与 MIME 判定。
for (const unsafe of ['/etc/passwd', '../secret', 'a/../b', 'a\\b', 'http://cdn/x', 'a//b', '']) {
  assert.equal(isSafeRelativePath(unsafe), false, `unsafe path must be rejected: ${unsafe}`);
}
assert.equal(isSafeRelativePath('cards/Hajimides/x.png'), true);
assert.equal(mimeForPath('x.js'), 'application/javascript');
assert.equal(mimeForPath('x.card'), '');
assert.equal(mimeMatches('application/javascript', 'text/javascript'), true);
assert.equal(mimeMatches('application/javascript', 'text/html'), false);
assert.equal(mimeMatches('text/html', 'application/xhtml+xml'), true);
assert.equal(mimeMatches('image/png', 'image/jpeg'), false);

// 3) 条目校验：缺 MIME、非法字节与摘要、重复路径都必须拒绝。
const goodEntry = { path: 'assets/js/app.js', mime: 'application/javascript', bytes: 3, sha256: sha256Hex(Buffer.from('app')) };
assert.deepEqual(validateManifestEntries([goodEntry], 'core'), []);
assert.ok(validateManifestEntries([{ ...goodEntry, mime: '' }]).length, 'missing MIME must be rejected.');
assert.ok(validateManifestEntries([{ ...goodEntry, bytes: -1 }]).length, 'negative bytes must be rejected.');
assert.ok(validateManifestEntries([{ ...goodEntry, sha256: 'nope' }]).length, 'invalid sha256 must be rejected.');
assert.ok(validateManifestEntries([goodEntry, { ...goodEntry }]).length, 'duplicate path must be rejected.');
assert.ok(validateManifestEntries([{ ...goodEntry, path: '../x' }]).length, 'traversal path must be rejected.');

function makeFixture(prefix) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const write = (relative, data) => {
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  };
  return { fixture, write };
}

const ENTRY_SOURCE = [
  '<!DOCTYPE html><html><head>',
  '<script id="ot-runtime-config" data-release="" data-snapshot=""></script>',
  '<link rel="stylesheet" href="assets/css/app.css">',
  '<script src="assets/js/app.js"></script>',
  '</head><body></body></html>',
].join('\n');
const CORE_ASSET_INPUTS = [
  { path: 'assets/js/app.js', mime: 'application/javascript' },
  { path: 'assets/css/app.css', mime: 'text/css' },
];
const PUBLIC_INPUTS = [
  { path: 'cards/a.png' },
  { path: 'cards/b.json' },
];

function writeSharedInputs(write, { withUiManifest = false } = {}) {
  write('assets/js/app.js', 'console.log(1);\n');
  write('assets/css/app.css', 'body{}\n');
  write('src/offline/opentavern-sw.js', '// stub sw\n');
  write('cards/a.png', Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  write('cards/b.json', '{"name":"b"}\n');
  if (withUiManifest) {
    write('src/ui/manifest.json', JSON.stringify({ html: ['start.html', 'end.html'] }));
    write('src/ui/html/start.html', ENTRY_SOURCE.slice(0, ENTRY_SOURCE.lastIndexOf('</head>')));
    write('src/ui/html/end.html', '</head><body></body></html>\n');
  } else {
    write('entry-source.html', ENTRY_SOURCE);
  }
}

// 4) 夹具构建：规范入口→固定版本、入口与别名同字节、公共资料参与 releaseId。
{
  const { fixture, write } = makeFixture('ot-offline-manifest-');
  try {
    writeSharedInputs(write, { withUiManifest: true });
    const options = {
      root: fixture, base: '.', coreAssets: CORE_ASSET_INPUTS, publicEntries: PUBLIC_INPUTS,
      entryPath: 'index.html', aliasEntryPaths: ['opentavern.html'],
      uiManifestSource: 'src/ui/manifest.json', uiHtmlDir: 'src/ui/html',
    };
    const first = await buildOfflineManifest(options);
    assert.equal(first.written, true);
    assert.equal(first.manifest.formatVersion, 1);
    assert.equal(first.manifest.dataVersion, 1);
    assert.match(first.releaseId, /^[0-9a-f]{24}$/);
    assert.equal(first.manifest.core.length, 3, 'core must include the entry shell plus two assets.');
    assert.equal(first.manifest.public.length, 2);
    assert.equal(first.manifest.totals.public.count, 2);

    const manifestPath = path.join(fixture, 'offline-manifest.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), first.manifest);

    // 入口与别名都是固定版本字节（相对引用指向不可变快照）。
    const entry = fs.readFileSync(path.join(fixture, 'index.html'), 'utf8');
    assert.match(entry, new RegExp(`data-release="${first.releaseId}"`), 'entry must pin its release id.');
    assert.match(entry, new RegExp(`href="assets/offline/${first.releaseId}/assets/css/app.css"`), 'entry must pin stylesheet references.');
    assert.match(entry, new RegExp(`src="assets/offline/${first.releaseId}/assets/js/app.js"`), 'entry must pin script references.');
    assert.equal(fs.readFileSync(path.join(fixture, 'opentavern.html'), 'utf8'), entry, 'the served entry alias must share the same pinned bytes.');

    // 快照外壳与入口逐字节一致；核心副本与 SW 就位；暂存目录已清理。
    const releaseDir = path.join(fixture, 'assets', 'offline', first.releaseId);
    assert.equal(fs.readFileSync(path.join(releaseDir, 'index.html'), 'utf8'), entry, 'the snapshot shell must match the pinned entry.');
    assert.equal(fs.existsSync(path.join(releaseDir, 'assets', 'js', 'app.js')), true);
    // HTML 传输副本与 pinned 入口逐字节相同，且不作为第 18 个逻辑核心条目。
    assert.equal(fs.readFileSync(path.join(releaseDir, 'index.html.txt'), 'utf8'), entry, 'the HTML transport copy must be byte-identical to the pinned entry.');
    assert.equal(first.manifest.core.length, 3, 'the transport copy must not become an extra manifest core entry.');
    assert.equal(first.manifest.core.some((item) => item.path.endsWith('.txt')), false, 'the transport copy must stay out of manifest.core.');
    assert.equal(fs.existsSync(path.join(fixture, 'opentavern-sw.js')), true);
    assert.equal(fs.readdirSync(path.join(fixture, 'assets', 'offline')).some((name) => name.startsWith('.staging-')), false, 'staging must be cleaned up.');
    // 规范入口源不得被改写。
    assert.match(fs.readFileSync(path.join(fixture, 'src/ui/html/start.html'), 'utf8'), /data-release=""/, 'the canonical source must stay unpinned.');

    // 相同输入 → 相同 releaseId；已有完整同版本目录被复用（不逐文件改写）。
    const marker = path.join(releaseDir, 'reuse-marker.txt');
    fs.writeFileSync(marker, 'keep');
    const second = await buildOfflineManifest(options);
    assert.equal(second.releaseId, first.releaseId, 'identical inputs must produce an identical releaseId.');
    assert.equal(fs.existsSync(marker), true, 'a complete identical release directory must be reused, not rebuilt.');
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), second.manifest);

    // 损坏的同版本目录必须被整体替换，而不是逐文件覆盖。
    fs.rmSync(path.join(releaseDir, 'assets', 'js', 'app.js'));
    const repaired = await buildOfflineManifest(options);
    assert.equal(repaired.releaseId, first.releaseId);
    assert.equal(fs.existsSync(path.join(releaseDir, 'assets', 'js', 'app.js')), true, 'a damaged release directory must be restored wholesale.');
    assert.equal(fs.existsSync(marker), false, 'wholesale replacement must not preserve stray bytes.');

    // 已有同版本目录缺少或损坏 HTML 传输副本时必须拒绝复用并重建，而不是沿用旧目录。
    fs.rmSync(path.join(releaseDir, 'index.html.txt'));
    fs.writeFileSync(marker, 'keep');
    const rebuiltMissing = await buildOfflineManifest(options);
    assert.equal(rebuiltMissing.releaseId, first.releaseId);
    assert.equal(fs.readFileSync(path.join(releaseDir, 'index.html.txt'), 'utf8'), entry, 'a missing HTML transport copy must be rewritten.');
    assert.equal(fs.existsSync(marker), false, 'a missing transport copy must force a wholesale rebuild, not reuse.');
    fs.writeFileSync(path.join(releaseDir, 'index.html.txt'), 'tampered');
    const rebuiltCorrupt = await buildOfflineManifest(options);
    assert.equal(rebuiltCorrupt.releaseId, first.releaseId);
    assert.equal(fs.readFileSync(path.join(releaseDir, 'index.html.txt'), 'utf8'), entry, 'a corrupted HTML transport copy must be restored.');
    assert.equal(fs.existsSync(marker), false, 'a corrupted transport copy must force a wholesale rebuild, not reuse.');

    // 公共资料同一路径换字节必须改变 releaseId（且不复制公共文件）。
    const beforeId = first.releaseId;
    fs.writeFileSync(path.join(fixture, 'cards/a.png'), Buffer.from([137, 80, 78, 71, 9, 9, 9, 9]));
    const changed = await buildOfflineManifest({ ...options, write: false });
    assert.notEqual(changed.releaseId, beforeId, 'changing one public file must change releaseId.');
    assert.equal(fs.existsSync(path.join(fixture, 'assets', 'offline', changed.releaseId, 'cards', 'a.png')), false, 'public files must not be copied per version.');

    // 缺失核心文件、重复公共路径都必须整单拒绝，不写清单。
    fs.rmSync(manifestPath);
    await assert.rejects(
      buildOfflineManifest({ ...options, coreAssets: [...CORE_ASSET_INPUTS, { path: 'assets/js/missing.js', mime: 'application/javascript' }] }),
      /missing/i,
    );
    assert.equal(fs.existsSync(manifestPath), false, 'a failed build must not publish a manifest.');
    await assert.rejects(buildOfflineManifest({ ...options, publicEntries: [...PUBLIC_INPUTS, { path: 'cards/b.json' }] }), /duplicate/i);
    assert.equal(fs.existsSync(manifestPath), false);

    // 一次成功发布后移除 Service Worker 源：再次构建必须失败且保留旧入口/清单。
    const pristine = makeFixture('ot-offline-manifest-pristine-');
    try {
      writeSharedInputs(pristine.write, { withUiManifest: true });
      const pristineOptions = { ...options, root: pristine.fixture };
      const published = await buildOfflineManifest(pristineOptions);
      const beforeEntry = fs.readFileSync(path.join(pristine.fixture, 'index.html'), 'utf8');
      fs.rmSync(path.join(pristine.fixture, 'src/offline/opentavern-sw.js'));
      await assert.rejects(buildOfflineManifest(pristineOptions), /Service worker source is missing/);
      assert.equal(fs.readFileSync(path.join(pristine.fixture, 'index.html'), 'utf8'), beforeEntry, 'a failed build must not rewrite the entry.');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(pristine.fixture, 'offline-manifest.json'), 'utf8')), published.manifest, 'a failed build must retain the previous manifest.');
    } finally {
      fs.rmSync(pristine.fixture, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

// 4b) write:false 只做纯计算：返回 entryHtml，不落盘、不改入口。
{
  const { fixture, write } = makeFixture('ot-offline-manifest-pure-');
  try {
    writeSharedInputs(write, { withUiManifest: true });
    assert.equal(fs.existsSync(path.join(fixture, 'index.html')), false, 'the fixture must start without a pinned entry.');
    const result = await buildOfflineManifest({
      root: fixture, base: '.', coreAssets: CORE_ASSET_INPUTS, publicEntries: PUBLIC_INPUTS,
      entryPath: 'index.html', uiManifestSource: 'src/ui/manifest.json', uiHtmlDir: 'src/ui/html', write: false,
    });
    assert.equal(result.written, false);
    assert.match(result.entryHtml, new RegExp(`data-release="${result.releaseId}"`));
    assert.equal(result.shellBytes.toString('utf8'), result.entryHtml);
    assert.equal(fs.existsSync(path.join(fixture, 'index.html')), false, 'write:false must not write the entry.');
    assert.equal(fs.existsSync(path.join(fixture, 'index.html.txt')), false, 'write:false must not write the HTML transport copy.');
    assert.equal(fs.existsSync(path.join(fixture, 'offline-manifest.json')), false);
    assert.equal(fs.existsSync(path.join(fixture, 'assets', 'offline')), false);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

// 4c) 极简夹具：无 src/ui 清单时回退到 entrySource 文件，且仍旧确定/幂等。
{
  const { fixture, write } = makeFixture('ot-offline-manifest-fallback-');
  try {
    writeSharedInputs(write, { withUiManifest: false });
    const options = {
      root: fixture, base: '.', coreAssets: CORE_ASSET_INPUTS, publicEntries: PUBLIC_INPUTS,
      entrySource: 'entry-source.html', entryPath: 'index.html',
    };
    const first = await buildOfflineManifest(options);
    assert.match(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), new RegExp(`data-release="${first.releaseId}"`));
    assert.match(fs.readFileSync(path.join(fixture, 'entry-source.html'), 'utf8'), /data-release=""/, 'the fallback source must stay unpinned.');
    const second = await buildOfflineManifest(options);
    assert.equal(second.releaseId, first.releaseId, 'the fallback path must stay idempotent.');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

// 4d) 配置路径不得逃出输出目录或项目根。
{
  const { fixture, write } = makeFixture('ot-offline-manifest-escape-');
  try {
    writeSharedInputs(write, { withUiManifest: true });
    const base = { root: fixture, base: '.', coreAssets: CORE_ASSET_INPUTS, publicEntries: PUBLIC_INPUTS, uiManifestSource: 'src/ui/manifest.json', uiHtmlDir: 'src/ui/html' };
    await assert.rejects(buildOfflineManifest({ ...base, base: '..' }), /outside the project root/);
    await assert.rejects(buildOfflineManifest({ ...base, entryPath: '../escape.html' }), /Unsafe entry path/);
    await assert.rejects(buildOfflineManifest({ ...base, aliasEntryPaths: ['/abs.html'] }), /Unsafe alias entry path/);
    await assert.rejects(buildOfflineManifest({ ...base, swOutput: '../sw.js' }), /Unsafe service worker output/);
    await assert.rejects(buildOfflineManifest({ ...base, manifestName: 'a/../../b.json' }), /Unsafe manifest name/);
    await assert.rejects(buildOfflineManifest({ ...base, publicEntries: [{ path: '../escape.png' }] }), /Unsafe public entry path/);
    assert.equal(fs.existsSync(path.join(fixture, 'offline-manifest.json')), false);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

// 5) 真实仓库：核心输入存在，公共引用都能拿到 MIME，且新的 ESM 镜像已入库到 CORE_ASSETS。
for (const relative of ['assets/js/vendor/vue-3.5.43.esm-browser.prod.js', 'assets/js/vendor/js-yaml-4.1.1.mjs']) {
  assert.ok(CORE_ASSETS.some((asset) => asset.path === relative), `${relative} must be a core asset.`);
}
const realCatalog = fs.readFileSync(path.join(root, 'src/app/library/60-public-card-data.js'), 'utf8');
const pattern = /"(?:coverImage|previewImage|jsonUrl)"\s*:\s*"([^"]+)"/g;
const publicPaths = new Set();
for (const match of realCatalog.matchAll(pattern)) publicPaths.add(decodeURIComponent(match[1].replace(/^\/+/, '')));
assert.equal(publicPaths.size, 296, 'The public catalog must reference exactly 296 unique files.');
for (const relative of publicPaths) assert.ok(mimeForPath(relative) && isSafeRelativePath(relative), `catalog entry must be a safe, typed path: ${relative}`);

console.log('Offline manifest checks passed: deterministic releaseId over core+entry+public, pinned entry/alias/shell, atomic reuse/replace, path constraints and refusal to publish partial output.');
