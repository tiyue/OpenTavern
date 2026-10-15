/**
 * 新手导读：这个 Node.js 脚本把源码构建结果装配成 Sites 预览/发布目录 .sites-public。
 *
 * 它复制已构建的 assets（含本地 Tailwind、DOMPurify 与 marked）、公开角色卡资源，
 * 再用同一份规范入口生成“已固定版本”的 opentavern.html（与根 index.html 逐字节一致，
 * 相对基址在 / 与 /.sites-public/ 都成立），最后为该目录生成离线清单、不可变核心快照
 * 与 Service Worker。不再做任何 CDN 字符串替换。
 */
import { copyFile, cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOfflineManifest } from './build-offline-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.sites-public');
if (path.dirname(output) !== root || path.basename(output) !== '.sites-public') {
  throw new Error('Refusing to prepare Sites assets outside the project root.');
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await copyFile(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));

const catalogSource = await readFile(path.join(root, 'src/app/library/60-public-card-data.js'), 'utf8');
const assetPattern = /"(?:coverImage|previewImage|jsonUrl)"\s*:\s*"([^"]+)"/g;
const assetPaths = new Set();
for (const match of catalogSource.matchAll(assetPattern)) {
  const urlPath = match[1].replace(/^\/+/, '');
  assetPaths.add(decodeURIComponent(urlPath));
}

let packagedBytes = 0;
for (const relativePath of assetPaths) {
  const source = path.resolve(root, relativePath);
  const target = path.resolve(output, relativePath);
  if (!source.startsWith(path.join(root, 'cards') + path.sep)) {
    throw new Error(`Public card path escaped the cards directory: ${relativePath}`);
  }
  const info = await stat(source);
  if (!info.isFile()) throw new Error(`Public card asset is not a file: ${relativePath}`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  packagedBytes += info.size;
}

// 入口由 buildOfflineManifest 依据同一份规范源生成，产出与根 index.html 相同的固定字节。
const result = await buildOfflineManifest({ root, base: '.sites-public', entryPath: 'index.html', aliasEntryPaths: ['opentavern.html'] });

console.log(`Prepared ${assetPaths.size} referenced card assets (${(packagedBytes / 1024 / 1024).toFixed(2)} MiB) and offline release ${result.releaseId} for Sites.`);
