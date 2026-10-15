/**
 * 新手导读：这个 Node.js 脚本生成可核对的离线资源清单与不可变核心快照。
 *
 * 它从 src/ui 清单分片（隔离夹具可回退到 entrySource 文件）推导规范入口 HTML，读取已构建的
 * 应用资源与公开角色卡目录，产出 offline-manifest.json、把核心资源复制成
 * assets/offline/<releaseId>/<原路径> 的不可变副本，并把同一个“已固定版本”的入口 HTML
 * 同时写入服务入口（entryPath 及其别名）与快照外壳；同时把 Service Worker 复制到发布根。
 * releaseId 由排序后的输入摘要推导：核心资源 + 规范入口（改写前）+ 公共资料，排除清单本身
 * 与上轮生成目录，避免自引用。快照先写入独立暂存目录并校验，再整体改名；全部输入在写入前
 * 读取校验完毕，任何一步失败都不会留下半成品版本或改写已发布的清单/入口。
 */
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 有限的应用运行时核心资源（含固定 vendor，普通与 ESM 两种官方镜像），不包含任何公共角色卡。
export const CORE_ASSETS = [
  { path: 'assets/js/app.js', mime: 'application/javascript' },
  { path: 'assets/css/app.css', mime: 'text/css' },
  { path: 'assets/css/tailwind.css', mime: 'text/css' },
  { path: 'assets/js/purify.min.js', mime: 'application/javascript' },
  { path: 'assets/js/marked.umd.js', mime: 'application/javascript' },
  { path: 'assets/js/theme-preload.js', mime: 'application/javascript' },
  { path: 'assets/js/regex-worker.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/card-runtime-vendors.json', mime: 'application/json' },
  { path: 'assets/js/vendor/es-module-lexer-2.3.2.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/jquery-3.7.1.min.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/js-sha256-1.0.0.min.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/js-yaml-4.1.1.min.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/js-yaml-4.1.1.mjs', mime: 'application/javascript' },
  { path: 'assets/js/vendor/lodash-4.17.23.min.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/vue-3.5.43.min.js', mime: 'application/javascript' },
  { path: 'assets/js/vendor/vue-3.5.43.esm-browser.prod.js', mime: 'application/javascript' },
];

export const DEFAULT_OPTIONS = {
  base: '.',
  entrySource: 'index.html',
  entryPath: 'index.html',
  aliasEntryPaths: [],
  basePath: '/',
  manifestName: 'offline-manifest.json',
  swSource: 'src/offline/opentavern-sw.js',
  swOutput: 'opentavern-sw.js',
  catalogSource: 'src/app/library/60-public-card-data.js',
  uiManifestSource: 'src/ui/manifest.json',
  uiHtmlDir: 'src/ui/html',
  coreAssets: CORE_ASSETS,
  publicEntries: null,
  write: true,
};

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const MIME_FAMILIES = {
  html: ['text/html', 'application/xhtml+xml'],
  js: ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript', 'text/ecmascript'],
  css: ['text/css'],
  json: ['application/json', 'text/json'],
  png: ['image/png'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  svg: ['image/svg+xml'],
};

export function mimeFamily(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  for (const [family, members] of Object.entries(MIME_FAMILIES)) {
    if (members.includes(type)) return family;
  }
  return type;
}

export function mimeMatches(expected, actual) {
  const expectedFamily = mimeFamily(expected);
  const actualFamily = mimeFamily(actual);
  if (!actualFamily) return false;
  if (expectedFamily === actualFamily) return true;
  // 未登记的扩展名按精确 media type 比较，避免把任意类型当成通过。
  return String(expected || '').split(';')[0].trim().toLowerCase() === actualFamily;
}

export function mimeForPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const table = {
    '.html': 'text/html', '.htm': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
  };
  return table[ext] || '';
}

export function isSafeRelativePath(value) {
  const text = String(value == null ? '' : value);
  if (!text) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return false;      // 拒绝带 scheme 的绝对 URL/凭据
  if (text.startsWith('/') || text.startsWith('\\')) return false;
  if (text.includes('\\') || text.includes('//')) return false;
  return !text.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

// 校验清单条目结构：路径安全、无重复、MIME/字节/摘要齐全且形状正确。
export function validateManifestEntries(entries, label = 'entries') {
  const errors = [];
  const seen = new Set();
  if (!Array.isArray(entries)) return [`${label} must be an array`];
  entries.forEach((entry, index) => {
    const where = `${label}[${index}]`;
    if (!entry || typeof entry !== 'object') { errors.push(`${where} must be an object`); return; }
    if (!isSafeRelativePath(entry.path)) { errors.push(`${where} has an unsafe path: ${entry.path}`); return; }
    if (seen.has(entry.path)) errors.push(`${where} duplicates path: ${entry.path}`);
    seen.add(entry.path);
    if (!entry.mime || !mimeFamily(entry.mime)) errors.push(`${where} is missing a known MIME for ${entry.path}`);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) errors.push(`${where} has an invalid byte count for ${entry.path}`);
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push(`${where} has an invalid sha256 for ${entry.path}`);
  });
  return errors;
}

export function computeReleaseId(records) {
  const lines = records
    .map((record) => ({ source: String(record.source), sha256: String(record.sha256), bytes: Number(record.bytes) || 0 }))
    .sort((left, right) => (left.source < right.source ? -1 : left.source > right.source ? 1 : 0))
    .map((record) => `${record.source}\0${record.sha256}\0${record.bytes}`);
  return sha256Hex(lines.join('\n')).slice(0, 24);
}

function readCatalogPaths(catalogSource) {
  const pattern = /"(?:coverImage|previewImage|jsonUrl)"\s*:\s*"([^"]+)"/g;
  const paths = new Set();
  for (const match of String(catalogSource).matchAll(pattern)) {
    const relative = decodeURIComponent(match[1].replace(/^\/+/, ''));
    paths.add(relative);
  }
  return [...paths].sort();
}

// 入口改写：只补全 data-release 并给相对资源引用加上不可变快照前缀，保留 SRI 与相对基址。
function rewriteEntryHtml(source, releaseId) {
  const releaseAttribute = /(id="ot-runtime-config"[^>]*data-release=")[^"]*"/;
  if (!releaseAttribute.test(source)) {
    throw new Error('Entry HTML is missing the runtime config placeholder; refusing to publish an incomplete snapshot.');
  }
  const prefix = `assets/offline/${releaseId}/`;
  return source
    .replace(releaseAttribute, `$1${releaseId}"`)
    .replace(/(\b(?:src|href)=")assets\//g, `$1${prefix}assets/`);
}

// HTML 核心的纯文本传输副本后缀：托管层可能给真正的 HTML 响应注入内容，
// 快照额外写一份与 pinned 入口逐字节相同的 .txt，供运行时按原摘要校验下载。
const HTML_TRANSPORT_SUFFIX = '.txt';

// 有限路径约束：配置项一律不能借相对路径逃出项目根或输出目录。
function assertSafeRelative(value, label) {
  if (!isSafeRelativePath(value)) throw new Error(`Unsafe ${label} path: ${value}`);
  return value;
}

function resolveWithin(candidate, baseDir, label) {
  if (!isSafeRelativePath(candidate)) throw new Error(`Unsafe ${label}: ${candidate}`);
  const target = path.resolve(baseDir, String(candidate));
  const relative = path.relative(baseDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to place ${label} outside its directory: ${candidate}`);
  }
  return target;
}

// 规范入口：优先用 src/ui 清单分片顺序拼接（改写前的确定输入），缺失时回退到 entrySource 文件。
async function readCanonicalEntry(root, options) {
  const manifestFile = resolveWithin(options.uiManifestSource, root, 'ui manifest');
  const manifestBytes = await fsp.readFile(manifestFile).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (manifestBytes) {
    let manifest;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch (error) {
      throw new Error(`UI manifest is not valid JSON: ${options.uiManifestSource}`);
    }
    if (manifest && Array.isArray(manifest.html) && manifest.html.length) {
      const parts = [];
      for (const fragment of manifest.html) {
        assertSafeRelative(fragment, 'UI HTML fragment');
        parts.push(await fsp.readFile(resolveWithin(path.posix.join(options.uiHtmlDir, fragment), root, 'UI HTML fragment')));
      }
      return { bytes: Buffer.concat(parts), label: options.entrySource };
    }
  }
  const file = resolveWithin(options.entrySource, root, 'entry source');
  const stats = await fsp.stat(file).catch(() => null);
  if (!stats || !stats.isFile()) throw new Error(`Entry HTML is missing: ${options.entrySource}`);
  return { bytes: await fsp.readFile(file), label: options.entrySource };
}

async function collectPublicEntries(root, options) {
  if (options.publicEntries) {
    const entries = [];
    for (const item of options.publicEntries) {
      assertSafeRelative(item.path, 'public entry');
      const mime = item.mime || mimeForPath(item.path);
      if (!mime) throw new Error(`Unknown MIME for public entry: ${item.path}`);
      const file = resolveWithin(item.file || item.path, root, 'public entry');
      const stats = await fsp.stat(file).catch(() => null);
      if (!stats || !stats.isFile()) throw new Error(`Public entry file is missing: ${item.file || item.path}`);
      const bytes = await fsp.readFile(file);
      entries.push({ path: item.path, mime, bytes: bytes.length, sha256: sha256Hex(bytes) });
    }
    return entries;
  }
  const catalogFile = resolveWithin(options.catalogSource, root, 'public card catalog');
  const catalogSource = await fsp.readFile(catalogFile, 'utf8').catch(() => {
    throw new Error(`Public card catalog is missing: ${options.catalogSource}`);
  });
  const entries = [];
  for (const relative of readCatalogPaths(catalogSource)) {
    assertSafeRelative(relative, 'public catalog entry');
    const mime = mimeForPath(relative);
    if (!mime) throw new Error(`Unknown MIME for public catalog entry: ${relative}`);
    const file = resolveWithin(relative, root, 'public catalog file');
    const stats = await fsp.stat(file).catch(() => null);
    if (!stats || !stats.isFile()) throw new Error(`Public catalog file is missing: ${relative}`);
    const bytes = await fsp.readFile(file);
    entries.push({ path: relative, mime, bytes: bytes.length, sha256: sha256Hex(bytes) });
  }
  return entries;
}

function totals(entries) {
  return { count: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}

// 已有同版本目录只有在每个期望条目字节都完全一致时才可复用。
async function snapshotMatches(releaseDir, entries) {
  for (const entry of entries) {
    const bytes = await fsp.readFile(path.join(releaseDir, entry.path)).catch(() => null);
    if (!bytes || bytes.length !== entry.bytes || sha256Hex(bytes) !== entry.sha256) return false;
  }
  return true;
}

async function writeFileAtomic(target, bytes) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await fsp.writeFile(temporary, bytes);
  await fsp.rename(temporary, target);
}

export async function buildOfflineManifest(userOptions = {}) {
  const root = path.resolve(userOptions.root || defaultRoot);
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const outBase = path.resolve(root, options.base);
  const relativeBase = path.relative(root, outBase);
  if (relativeBase.startsWith('..') || path.isAbsolute(relativeBase)) {
    throw new Error(`Refusing to build offline manifest outside the project root: ${options.base}`);
  }

  // 所有配置路径先做有限约束，避免 entryPath/swOutput/manifestName/base 逃出输出目录或项目根。
  const entryTarget = resolveWithin(options.entryPath, outBase, 'entry path');
  const aliasTargets = (options.aliasEntryPaths || []).map((item) => resolveWithin(item, outBase, 'alias entry path'));
  const manifestTarget = resolveWithin(options.manifestName, outBase, 'manifest name');
  const swTarget = resolveWithin(options.swOutput, outBase, 'service worker output');

  // 1) 写入前先读取并校验全部输入。
  const canonical = await readCanonicalEntry(root, options);
  const publicEntries = await collectPublicEntries(root, options);
  const publicErrors = validateManifestEntries(publicEntries, 'public');
  if (publicErrors.length) throw new Error(`Invalid public manifest entries:\n- ${publicErrors.join('\n- ')}`);

  const coreRecords = [];
  const coreInputs = [];
  for (const asset of options.coreAssets) {
    assertSafeRelative(asset.path, 'core asset');
    if (!mimeFamily(asset.mime)) throw new Error(`Core asset is missing a known MIME: ${asset.path}`);
    const file = resolveWithin(asset.path, root, 'core asset');
    const stats = await fsp.stat(file).catch(() => null);
    if (!stats || !stats.isFile()) throw new Error(`Core asset is missing: ${asset.path}`);
    const bytes = await fsp.readFile(file);
    coreRecords.push({ source: asset.path, sha256: sha256Hex(bytes), bytes: bytes.length });
    coreInputs.push({ path: asset.path, mime: asset.mime, bytes });
  }
  const swFile = resolveWithin(options.swSource, root, 'service worker source');
  const swStats = await fsp.stat(swFile).catch(() => null);
  if (!swStats || !swStats.isFile()) throw new Error(`Service worker source is missing: ${options.swSource}`);
  const swBytes = await fsp.readFile(swFile);

  // releaseId = 排序后的核心资源 + 规范入口（改写前）+ 公共资料摘要；不含清单/SW/上轮生成目录。
  const releaseRecords = [
    ...coreRecords,
    { source: canonical.label, sha256: sha256Hex(canonical.bytes), bytes: canonical.bytes.length },
    ...publicEntries.map((entry) => ({ source: entry.path, sha256: entry.sha256, bytes: entry.bytes })),
  ];
  const releaseId = computeReleaseId(releaseRecords);

  const entryHtml = rewriteEntryHtml(canonical.bytes.toString('utf8'), releaseId);
  const entryBytes = Buffer.from(entryHtml, 'utf8');

  const coreEntries = coreInputs.map((input) => ({ path: input.path, mime: input.mime, bytes: input.bytes.length, sha256: sha256Hex(input.bytes) }));
  coreEntries.push({ path: options.entryPath, mime: 'text/html', bytes: entryBytes.length, sha256: sha256Hex(entryBytes) });
  const coreErrors = validateManifestEntries(coreEntries, 'core');
  if (coreErrors.length) throw new Error(`Invalid core manifest entries:\n- ${coreErrors.join('\n- ')}`);
  // 传输副本不进 manifest.core（清单仍是逻辑核心），只作为快照目录里的额外同字节文件。
  const transportEntry = {
    path: options.entryPath + HTML_TRANSPORT_SUFFIX,
    mime: 'text/plain',
    bytes: entryBytes.length,
    sha256: sha256Hex(entryBytes),
  };
  const snapshotEntries = [...coreEntries, transportEntry];

  const manifest = {
    formatVersion: 1,
    dataVersion: 1,
    releaseId,
    basePath: options.basePath,
    core: coreEntries,
    public: publicEntries,
    totals: { core: totals(coreEntries), public: totals(publicEntries) },
  };

  if (options.write === false) {
    return { releaseId, manifest, shellBytes: entryBytes, entryHtml, written: false, outputBase: outBase };
  }

  // 2) 快照先落到独立暂存目录，校验通过后再整体改名；只清理自己的暂存目录。
  const offlineRoot = path.join(outBase, 'assets', 'offline');
  await fsp.mkdir(offlineRoot, { recursive: true });
  const releaseDir = path.join(offlineRoot, releaseId);
  const staging = await fsp.mkdtemp(path.join(offlineRoot, '.staging-'));
  try {
    for (const input of coreInputs) await writeFileAtomic(path.join(staging, input.path), input.bytes);
    await writeFileAtomic(path.join(staging, options.entryPath), entryBytes);
    await writeFileAtomic(path.join(staging, transportEntry.path), entryBytes);
    for (const entry of snapshotEntries) {
      const bytes = await fsp.readFile(path.join(staging, entry.path));
      if (bytes.length !== entry.bytes || sha256Hex(bytes) !== entry.sha256) throw new Error(`Staged snapshot entry failed verification: ${entry.path}`);
    }

    let reuse = false;
    const existing = await fsp.stat(releaseDir).catch(() => null);
    if (existing && existing.isDirectory()) {
      // 复用已有同版本目录时必须同时核对 HTML 传输副本，缺失或损坏一律重建。
      reuse = await snapshotMatches(releaseDir, snapshotEntries);
      if (!reuse) await fsp.rm(releaseDir, { recursive: true, force: true });
    }
    if (!reuse) await fsp.rename(staging, releaseDir);
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  }

  // 3) 快照完整后才提交入口（含别名）、Service Worker 与清单。
  const entryTargets = [...new Set([entryTarget, ...aliasTargets])];
  for (const target of entryTargets) await writeFileAtomic(target, entryBytes);
  await writeFileAtomic(swTarget, swBytes);
  await writeFileAtomic(manifestTarget, Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));

  return { releaseId, manifest, shellBytes: entryBytes, entryHtml, written: true, outputBase: outBase };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] || '.';
  buildOfflineManifest({ base }).then((result) => {
    console.log(`Offline manifest written for base "${base}": release ${result.releaseId} (${result.manifest.totals.core.count} core, ${result.manifest.totals.public.count} public).`);
  }).catch((error) => {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  });
}
