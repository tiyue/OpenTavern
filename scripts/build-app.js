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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src', 'app');
const manifestPath = path.join(srcDir, 'manifest.json');
const outPath = path.join(root, 'assets', 'js', 'app.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s*$/, '\n');
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const parts = manifest.map((fileName) => {
    const filePath = path.join(srcDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing app source chunk: ${fileName}`);
    }
    return readText(filePath);
  });

  const bundle = parts.join('').replace(/\s*$/, '\n');
  fs.writeFileSync(outPath, bundle, 'utf8');
  console.log(`Built ${path.relative(root, outPath)} from ${manifest.length} chunks.`);
}

main();
