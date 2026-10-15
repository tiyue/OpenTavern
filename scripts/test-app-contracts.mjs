import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './build-app.js';
import { checkAppContracts, findDuplicateDeclarations } from './check-app-contracts.mjs';
import { assertFrontendMessageContentHelpers } from './tests/frontend/chat.mjs';
import { assertFrontendPublicCardListUI } from './tests/frontend/library.mjs';
import { assertFrontendConversationImportHelpers } from './tests/frontend/transfer.mjs';
import { assertFrontendCharacterImportEventHelpers } from './tests/frontend/conversation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/app/manifest.json'), 'utf8'));
const sources = manifest.map((file) => ({ file, text: fs.readFileSync(path.join(root, 'src/app', file), 'utf8') }));
assert.deepEqual(checkAppContracts({ root, manifest, sources }), [], 'Actual assembled module contracts must pass.');

function expectContractFailure(manifestValue, sourceValue, pattern, label) {
  const errors = checkAppContracts({ root, manifest: manifestValue, sources: sourceValue });
  assert.ok(errors.some((error) => pattern.test(error)), `${label}: ${errors.join('\n') || 'no contract error'}`);
}

function mutateSource(file, transform) {
  return sources.map((source) => source.file === file ? { ...source, text: transform(source.text) } : source);
}

function runBuildFailureFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opentavern-app-contracts-build-'));
  const output = path.join(fixture, 'assets/js/app.js');
  const originalBytes = Buffer.from([0x00, 0xff, 0x10, 0x41, 0x0a]);
  try {
    fs.mkdirSync(path.join(fixture, 'src/app'), { recursive: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'src/app/manifest.json'), '["bootstrap.js"]');
    fs.writeFileSync(path.join(fixture, 'src/app/bootstrap.js'), '(function () {})();\n');
    fs.writeFileSync(output, originalBytes);
    assert.throws(
      () => buildApp({ root: fixture, checkContracts: () => ['fixture contract failure'] }),
      /fixture contract failure/,
      'Build must reject a contract failure before writing the bundle.'
    );
    assert.deepEqual(fs.readFileSync(output), originalBytes, 'A failed build must preserve the original artifact bytes exactly.');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

const REGEX_WORKER_PLACEHOLDER = 'var REGEX_WORKER_SOURCE = null; // @@REGEX_WORKER_SOURCE@@';

function runRegexWorkerEmbedFixture() {
  const chunkFile = 'prompt/40-regex-worker-runtime.js';
  const workerSource = fs.readFileSync(path.join(root, 'assets/js/regex-worker.js'), 'utf8').replace(/\s*$/, '\n');
  const runtimeSource = fs.readFileSync(path.join(root, 'src/app', chunkFile), 'utf8');
  const appFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opentavern-regex-worker-app-'));
  const plainFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opentavern-plain-app-'));
  // 小夹具（装配清单不含 runtime 分片）仍能构建：内嵌逻辑只对包含该分片的清单生效。
  try {
    fs.mkdirSync(path.join(plainFixture, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(plainFixture, 'assets/js'), { recursive: true });
    fs.writeFileSync(path.join(plainFixture, 'src/app/manifest.json'), '["bootstrap.js"]');
    fs.writeFileSync(path.join(plainFixture, 'src/app/bootstrap.js'), '(function () {})();\n');
    assert.doesNotThrow(
      () => buildApp({ root: plainFixture, checkContracts: () => [] }),
      'A manifest without the regex runtime chunk must still build without the worker source file.'
    );
  } finally {
    fs.rmSync(plainFixture, { recursive: true, force: true });
  }

  const output = path.join(appFixture, 'assets/js/app.js');
  const chunkPath = path.join(appFixture, 'src/app', chunkFile);
  const workerPath = path.join(appFixture, 'assets/js/regex-worker.js');
  try {
    fs.mkdirSync(path.dirname(chunkPath), { recursive: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(path.join(appFixture, 'src/app/manifest.json'), JSON.stringify([chunkFile]));
    fs.writeFileSync(chunkPath, runtimeSource);
    fs.writeFileSync(workerPath, workerSource);
    buildApp({ root: appFixture, checkContracts: () => [] });
    const bundle = fs.readFileSync(output, 'utf8');
    const expected = `var REGEX_WORKER_SOURCE = ${JSON.stringify(workerSource)}; // @@REGEX_WORKER_SOURCE@@`;
    assert.ok(bundle.includes(expected), 'Built bundle must embed the canonical regex worker source verbatim.');
    assert.equal(bundle.split('@@REGEX_WORKER_SOURCE@@').length - 1, 1, 'The embedded placeholder must resolve exactly once.');
    assert.doesNotThrow(() => new Function(bundle), 'Embedding the regex worker source must not break JS parsing.');

    const originalBytes = fs.readFileSync(output);
    fs.rmSync(workerPath);
    assert.throws(
      () => buildApp({ root: appFixture, checkContracts: () => [] }),
      /Missing regex worker source/,
      'A missing local worker source must reject the build.'
    );
    assert.deepEqual(fs.readFileSync(output), originalBytes, 'A missing worker source must not partially overwrite the previous bundle.');
    fs.writeFileSync(workerPath, workerSource);

    fs.writeFileSync(chunkPath, runtimeSource.replace(REGEX_WORKER_PLACEHOLDER, 'var REGEX_WORKER_SOURCE = null;'));
    assert.throws(
      () => buildApp({ root: appFixture, checkContracts: () => [] }),
      /placeholder must appear exactly once .*found 0/,
      'A removed placeholder must reject the build.'
    );
    assert.deepEqual(fs.readFileSync(output), originalBytes, 'A removed placeholder must not partially overwrite the previous bundle.');

    fs.writeFileSync(chunkPath, runtimeSource.replace(REGEX_WORKER_PLACEHOLDER, `${REGEX_WORKER_PLACEHOLDER}\n${REGEX_WORKER_PLACEHOLDER}`));
    assert.throws(
      () => buildApp({ root: appFixture, checkContracts: () => [] }),
      /placeholder must appear exactly once .*found 2/,
      'A duplicated placeholder must reject the build.'
    );
    assert.deepEqual(fs.readFileSync(output), originalBytes, 'A duplicated placeholder must not partially overwrite the previous bundle.');
  } finally {
    fs.rmSync(appFixture, { recursive: true, force: true });
  }
}
function runStaticContractFixtures() {
  const duplicate = findDuplicateDeclarations([
    { file: 'a.js', text: 'function same() {}\n' },
    { file: 'b.js', text: 'var same;\n' }
  ]);
  assert.equal(duplicate.length, 1, 'Cross-file top-level duplicate declarations must fail exactly once.');
  assert.match(duplicate[0], /Duplicate top-level symbol "same"/);
  assert.match(duplicate[0], /a\.js:1:\d+/);
  assert.match(duplicate[0], /b\.js:1:\d+/);

  const legal = [
    { file: 'legacy-a.js', text: '// function same() {}\n(function () { function same() {} })();\n' },
    { file: 'legacy-b.js', text: '(function () { var same; })();\n' },
    { file: 'module-a.mjs', text: 'export function same() {}\n' },
    { file: 'module-b.mjs', text: 'export const same = 1;\n' },
    { file: 'noise.js', text: 'const text = "function same() {} var same;"; // function same() {}\n' }
  ];
  assert.deepEqual(findDuplicateDeclarations(legal), [], 'Nested IIFE, independent module, comment and string declarations must not be reported.');

  const missingManifest = manifest.filter((file) => file !== 'generation/50-generation-transport-module.js');
  const missingSources = sources.filter((source) => source.file !== 'generation/50-generation-transport-module.js');
  expectContractFailure(missingManifest, missingSources, /Missing module dependency .*50-generation-transport-module\.js/, 'Missing module dependency fixture');

  const transportIndex = manifest.indexOf('generation/50-generation-transport-module.js');
  const responseIndex = manifest.indexOf('generation/50-generation-response-stream.js');
  const wrongOrder = manifest.slice();
  [wrongOrder[transportIndex], wrongOrder[responseIndex]] = [wrongOrder[responseIndex], wrongOrder[transportIndex]];
  expectContractFailure(wrongOrder, sources, /Assembly order error: .*50-generation-transport-module\.js must precede .*50-generation-response-stream\.js/, 'Assembly order fixture');

  const missingExportSources = mutateSource('generation/50-generation-transport-module.js', (text) => text.replace('buildCompletion: buildCompletion, ', ''));
  expectContractFailure(manifest, missingExportSources, /Missing module export "buildCompletion"/, 'Missing export fixture');

  const duplicateManifest = [...manifest, 'chat/61-message-display-model.js'];
  expectContractFailure(duplicateManifest, sources, /Duplicate manifest registration .*61-message-display-model\.js/, 'Duplicate registration fixture');

  const missingInjection = mutateSource('generation/50-generation-integrations.js', text => text.replace(/stateController:/, 'unrelatedController:'));
  expectContractFailure(manifest, missingInjection, /Missing module dependency "stateController"/, 'Missing injected dependency fixture');
  const wrongReceiver = mutateSource('generation/50-generation-integrations.js', text => text.replace('transport.request(', 'unrelated.request('));
  expectContractFailure(manifest, wrongReceiver, /Missing module integration transport\.request/, 'Unrelated receiver cannot satisfy integration');
}

await assertFrontendMessageContentHelpers();
await assertFrontendPublicCardListUI();
await assertFrontendConversationImportHelpers();
await assertFrontendCharacterImportEventHelpers();
runStaticContractFixtures();
runBuildFailureFixture();
runRegexWorkerEmbedFixture();

console.log('App contract tests passed: AST scope fixtures, module dependency fixtures, atomic failed build and regex worker embedding.');
