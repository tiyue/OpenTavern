/**
 * 新手导读：这个 Node.js 脚本把许多小型前端源码文件合并成浏览器真正加载的 app.js。
 *
 * src/app/manifest.json 是装配清单，文件顺序就是代码执行顺序。main() 逐项检查文件
 * 是否存在、读取文本、首尾规范化换行，然后写入 assets/js/app.js。这样源码可以按功能
 * 拆分维护，同时线上页面只需要加载一个脚本文件。
 *
 * 日常修改应发生在 src/app 中；运行 npm run build 才会更新 bundle。不要随意调整清单
 * 顺序，因为后面的分片可能调用前面刚定义的函数。缺失文件会主动报错，以免生成残缺应用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAppContracts } from './check-app-contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '..');

// 正则 Worker 的源码由本次 bundle 内嵌：runtime 分片留一个 null 占位，构建时用本地脚本精确替换，
// 保证执行期不再额外取网。占位缺失/重复或本地脚本缺失都会在写入 app.js 之前失败（不部分覆盖）。
const REGEX_WORKER_RUNTIME_CHUNK = 'prompt/40-regex-worker-runtime.js';
const REGEX_WORKER_SOURCE_FILE = path.join('assets', 'js', 'regex-worker.js');
const REGEX_WORKER_PLACEHOLDER = 'var REGEX_WORKER_SOURCE = null; // @@REGEX_WORKER_SOURCE@@';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s*$/, '\n');
}

export function buildApp(options = {}) {
  const root = options.root || defaultRoot;
  const checkContracts = options.checkContracts || checkAppContracts;
  const contractErrors = checkContracts({ root });
  if (contractErrors.length) {
    throw new Error(`App contract check failed:\n${contractErrors.map((error) => `- ${error}`).join('\n')}`);
  }
  const srcDir = path.join(root, 'src', 'app');
  const manifestPath = path.join(srcDir, 'manifest.json');
  const outPath = path.join(root, 'assets', 'js', 'app.js');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // 仅在装配清单包含 runtime 分片时才读取并内嵌本地 Worker 源码；不含该分片的小型构建夹具继续可用。
  let regexWorkerSource = null;
  if (manifest.includes(REGEX_WORKER_RUNTIME_CHUNK)) {
    const workerPath = path.join(root, REGEX_WORKER_SOURCE_FILE);
    if (!fs.existsSync(workerPath)) {
      throw new Error(`Missing regex worker source: ${REGEX_WORKER_SOURCE_FILE}`);
    }
    regexWorkerSource = readText(workerPath);
  }
  const parts = manifest.map((fileName) => {
    const filePath = path.join(srcDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing app source chunk: ${fileName}`);
    }
    const text = readText(filePath);
    if (fileName !== REGEX_WORKER_RUNTIME_CHUNK) return text;
    const occurrences = text.split(REGEX_WORKER_PLACEHOLDER).length - 1;
    if (occurrences !== 1) {
      throw new Error(`Regex worker placeholder must appear exactly once in ${fileName}, found ${occurrences}`);
    }
    // 用函数式替换：Worker 源码里含 `$'`/`$$` 等序列，字符串替换会把它们当成捕获组引用而导致内容被破坏。
    const embedded = `var REGEX_WORKER_SOURCE = ${JSON.stringify(regexWorkerSource)}; // @@REGEX_WORKER_SOURCE@@`;
    return text.replace(REGEX_WORKER_PLACEHOLDER, () => embedded);
  });

  const bundle = parts.join('').replace(/\s*$/, '\n');
  fs.writeFileSync(outPath, bundle, 'utf8');
  console.log(`Built ${path.relative(root, outPath)} from ${manifest.length} chunks.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildApp();
