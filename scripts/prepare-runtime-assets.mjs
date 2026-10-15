/**
 * 新手导读：这个 Node.js 脚本生成普通入口与 Sites 共用的本地运行资源。
 *
 * 它把项目锁定的 Tailwind 3.4.17 配置编译成 assets/css/tailwind.css，并复制锁定版本的
 * DOMPurify 与 marked 字节到 assets/js/。两个入口都引用这些同源本地文件，
 * 不再依赖任何 CDN，也不升级固定 vendor 版本。
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TAILWIND_CONFIG = 'sites.tailwind.config.cjs';
const TAILWIND_INPUT = 'sites/tailwind.input.css';
const TAILWIND_OUTPUT = 'assets/css/tailwind.css';
const LOCKED_COPIES = [
  ['node_modules/dompurify/dist/purify.min.js', 'assets/js/purify.min.js'],
  ['node_modules/marked/lib/marked.umd.js', 'assets/js/marked.umd.js'],
];

async function ensureOutputDirectories() {
  // Tailwind/复制目标目录必须先存在，否则 CLI 或 copyFile 会在缺失父目录时失败。
  for (const target of [TAILWIND_OUTPUT, ...LOCKED_COPIES.map(([, output]) => output)]) {
    await mkdir(path.join(root, path.dirname(target)), { recursive: true });
  }
}

function runTailwind() {
  const cli = path.join(root, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
  const result = spawnSync(process.execPath, [
    cli, '-c', TAILWIND_CONFIG, '-i', TAILWIND_INPUT, '-o', TAILWIND_OUTPUT, '--minify',
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tailwind build failed with status ${result.status}`);
}

async function copyLocked(source, target) {
  await mkdir(path.dirname(path.join(root, target)), { recursive: true });
  await copyFile(path.join(root, source), path.join(root, target));
}

await ensureOutputDirectories();
runTailwind();
for (const [source, target] of LOCKED_COPIES) await copyLocked(source, target);
console.log(`Prepared local runtime assets: ${TAILWIND_OUTPUT} and ${LOCKED_COPIES.length} locked vendor copies.`);
