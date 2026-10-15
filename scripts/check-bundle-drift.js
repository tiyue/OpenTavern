/**
 * 新手导读：这个脚本检查 JS、HTML、CSS 产物与 src/app、src/ui 源分片的一致性。
 *
 * 流程：先比较 CSS 精确拼接结果；HTML 在存在 build-offline-manifest.mjs 时用其纯计算（write:false）
 * 对照“规范入口→固定版本”的期望字节，缺失该模块的极简夹具则退回原始拼接。随后备份现有 bundle，
 * 运行 scripts/build-app.js 重建，用 SHA-256 内容哈希比对重建结果与原 bundle。一致则通过；不一致则
 * 恢复原 bundle 并以可操作信息失败，提示运行 npm run build。本检查只读版本产物，不写入清单/入口/SW。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'assets', 'js', 'app.js');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// 期望入口 HTML：有清单构建器时用其纯计算（write:false），极简夹具退回原始 ui 拼接。
export async function expectedIndexHtml(root, uiSource, uiManifest) {
  const builderPath = path.join(__dirname, 'build-offline-manifest.mjs');
  if (!fs.existsSync(builderPath)) {
    return Buffer.concat(uiManifest.html.map(file => fs.readFileSync(path.join(uiSource, 'html', file)))).toString('utf8');
  }
  const { buildOfflineManifest } = await import(pathToFileURL(builderPath).href);
  try {
    return (await buildOfflineManifest({ root, write: false })).entryHtml;
  } catch (error) {
    throw new Error(`Unable to compute the pinned entry HTML (run npm run build): ${error.message}`);
  }
}

async function main() {
  const uiSource = path.join(root, 'src/ui');
  const uiManifest = JSON.parse(fs.readFileSync(path.join(uiSource, 'manifest.json'), 'utf8'));

  // CSS 始终按 ui 清单精确拼接比对。
  const expectedCss = Buffer.concat(uiManifest.css.map(file => fs.readFileSync(path.join(uiSource, 'css', file))));
  if (!expectedCss.equals(fs.readFileSync(path.join(root, 'assets/css/app.css')))) {
    console.error('UI drift detected: assets/css/app.css does not match src/ui/css. Run: npm run build');
    process.exit(1);
  }

  let expectedHtml;
  try {
    expectedHtml = await expectedIndexHtml(root, uiSource, uiManifest);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (fs.readFileSync(path.join(root, 'index.html'), 'utf8') !== expectedHtml) {
    console.error('UI drift detected: index.html does not match the pinned entry generated from src/ui sources. Run: npm run build');
    process.exit(1);
  }

  if (!fs.existsSync(bundlePath)) {
    console.error(`Bundle not found: ${path.relative(root, bundlePath)}. Run: npm run build`);
    process.exit(1);
  }

  const original = fs.readFileSync(bundlePath, 'utf8');
  const originalHash = sha256(original);

  const build = spawnSync(process.execPath, [path.join(__dirname, 'build-app.js')], {
    cwd: root,
    encoding: 'utf8'
  });
  if (build.status !== 0) {
    fs.writeFileSync(bundlePath, original, 'utf8');
    process.stderr.write(build.stdout || '');
    process.stderr.write(build.stderr || '');
    console.error('Bundle rebuild failed, original bundle restored.');
    process.exit(build.status || 1);
  }

  const rebuilt = fs.readFileSync(bundlePath, 'utf8');
  const rebuiltHash = sha256(rebuilt);

  if (rebuiltHash === originalHash) {
    console.log(`Bundle in sync: assets/js/app.js matches src/app chunks (sha256 ${originalHash.slice(0, 12)}…).`);
    return;
  }

  fs.writeFileSync(bundlePath, original, 'utf8');
  console.error([
    'Bundle drift detected: assets/js/app.js does not match src/app source chunks.',
    `  committed bundle sha256: ${originalHash}`,
    `  rebuilt bundle  sha256: ${rebuiltHash}`,
    'Run `npm run build` to regenerate the bundle, then commit it.'
  ].join('\n'));
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
