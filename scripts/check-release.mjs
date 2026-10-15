import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_BROWSER_TESTS = [
    'test-generation-format-browser.mjs',
    'test-static-message-browser.mjs',
    'test-regex-queue-browser.mjs',
    'test-prompt-controls-browser.mjs',
    'test-message-reliability-browser.mjs',
    'test-card-runtime-browser.mjs',
    'test-regex-worker-browser.mjs',
    'test-local-render-browser.mjs',
    'test-local-first-browser.mjs',
];

// Shared evidence capture for the existing isolated browser tests.
export async function captureBrowserEvidence(page, output) {
    const viewport = page.viewportSize();
    const preference = await page.evaluate(() => document.body.dataset.uiThemePreference || 'new-light');
    const systemThemeEvidence = [];
    try {
        for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            for (const colorScheme of ['light', 'dark']) {
                await page.emulateMedia({ colorScheme });
                await page.evaluate(theme => applyUiTheme(theme, { cache: false }), `new-${colorScheme}`);
                await page.screenshot({ path: path.join(output, `matrix-${width}-${colorScheme}.png`), animations: 'disabled' });
                await page.evaluate(() => applyUiTheme('system', { cache: false }));
                await page.waitForFunction(scheme => document.body.classList.contains(`theme-new-${scheme}`), colorScheme);
                const evidence = await page.evaluate(() => ({
                    width: innerWidth,
                    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    theme: document.body.classList.contains('theme-new-dark') ? 'new-dark' : 'new-light',
                    matchMedia: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
                }));
                if (!evidence.noHorizontalOverflow) throw new Error(`Horizontal overflow at ${width}px ${colorScheme}.`);
                systemThemeEvidence.push(evidence);
                await page.screenshot({ path: path.join(output, `matrix-system-${width}-${colorScheme}.png`), animations: 'disabled' });
            }
        }
        const screenshotFiles = (await fsp.readdir(output)).filter(name => name.endsWith('.png') && name !== 'failure.png').sort();
        return { screenshotFiles, systemThemeEvidence };
    } finally {
        await page.emulateMedia({ colorScheme: null });
        await page.evaluate(theme => applyUiTheme(theme, { cache: false }), preference);
        if (viewport) await page.setViewportSize(viewport);
    }
}

const CORE_ARTIFACTS = [
    'offline-manifest.json',
    'opentavern-sw.js',
    'assets/js/app.js',
    'assets/css/app.css',
    'index.html',
    'dist/server/index.js',
    'dist/server/wrangler.json',
    'dist/client/opentavern.html',
    'dist/client/assets/js/app.js',
    'dist/client/assets/css/app.css',
    'dist/client/assets/css/tailwind.css',
    'dist/client/assets/js/purify.min.js',
    'dist/client/assets/js/marked.umd.js',
    'dist/.openai/hosting.json',
    '.sites-public/opentavern.html',
    '.sites-public/assets/js/app.js',
    '.sites-public/assets/css/tailwind.css',
    '.sites-public/assets/js/purify.min.js',
    '.sites-public/assets/js/marked.umd.js',
    '.sites-public/offline-manifest.json',
    '.sites-public/opentavern-sw.js',
    'dist/client/offline-manifest.json',
    'dist/client/opentavern-sw.js',
];

const ARTIFACT_TREES = ['assets/offline', 'dist', '.sites-public'];
const GENERATED_SOURCE_PATHS = new Set([
    'assets/js/app.js',
    'assets/css/app.css',
    'index.html',
    'dist',
    '.sites-public',
    'node_modules',
    'offline-manifest.json',
    'opentavern-sw.js',
]);
const SENSITIVE_REPORT_PATTERN = /("(?:authorization|api[-_]?key|token|secret|password|credential|cookie)"\s*:)|\bbearer\s+[a-z0-9._-]{8,}/i;

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function relativePath(root, target) {
    return path.relative(root, target).split(path.sep).join('/');
}

async function hashFile(root, relative) {
    const absolute = path.join(root, relative);
    try {
        const bytes = await fsp.readFile(absolute);
        return { sha256: sha256(bytes), bytes: bytes.length };
    } catch (error) {
        if (error.code === 'ENOENT') return { missing: true };
        throw error;
    }
}

async function listTreeFiles(root, directory) {
    const absolute = path.join(root, directory);
    const files = [];
    async function walk(current) {
        let entries;
        try {
            entries = await fsp.readdir(current, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const target = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(target);
            else if (entry.isFile()) files.push(relativePath(root, target));
        }
    }
    await walk(absolute);
    return files;
}

async function hashFiles(root, relativePaths) {
    const files = {};
    for (const relative of [...relativePaths].sort()) files[relative] = await hashFile(root, relative);
    const digest = createHash('sha256');
    for (const [relative, info] of Object.entries(files)) {
        digest.update(relative).update('\0');
        if (info.missing) digest.update('missing\0');
        else digest.update(info.sha256).update('\0').update(String(info.bytes)).update('\0');
    }
    return { sha256: digest.digest('hex'), files };
}

export async function collectArtifactState(root, options = {}) {
    const includeTrees = options.includeTrees !== false;
    const paths = new Set(CORE_ARTIFACTS);
    if (includeTrees) {
        for (const tree of ARTIFACT_TREES) {
            for (const relative of await listTreeFiles(root, tree)) paths.add(relative);
        }
    }
    return hashFiles(root, paths);
}

function isGeneratedSourcePath(relative) {
    if (relative.startsWith('assets/offline/')) return true;
    const first = relative.split('/')[0];
    return GENERATED_SOURCE_PATHS.has(relative) || GENERATED_SOURCE_PATHS.has(first);
}

async function gitListControlledFiles(root) {
    const result = await defaultRunCommand('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root });
    if (result.code !== 0) throw new Error(`Unable to list the controlled tree: ${result.stderr.trim()}`);
    return result.stdout.split('\0').filter(Boolean).filter(relative => !isGeneratedSourcePath(relative));
}

async function gitRevision(root) {
    const result = await defaultRunCommand('git', ['rev-parse', 'HEAD'], { cwd: root });
    if (result.code !== 0) throw new Error(`Unable to read source revision: ${result.stderr.trim()}`);
    return result.stdout.trim();
}

export async function collectSourceState(root, options = {}) {
    const list = options.listControlledFiles || gitListControlledFiles;
    return hashFiles(root, await list(root));
}

function sameFiles(left, right) {
    const leftKeys = Object.keys(left.files);
    const rightKeys = Object.keys(right.files);
    return left.sha256 === right.sha256 && leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

function missingCoreArtifacts(state) {
    return CORE_ARTIFACTS.filter(relative => !state.files[relative] || state.files[relative].missing === true);
}

function pngInfo(bytes) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length, sha256: sha256(bytes) };
}

async function inspectScreenshots(root, outputDirectory, names) {
    const screenshots = [];
    const failures = [];
    const outputRoot = path.resolve(outputDirectory);
    for (const name of names) {
        if (typeof name !== 'string' || path.isAbsolute(name)) {
            failures.push(`Invalid screenshot path: ${String(name)}`);
            continue;
        }
        const normalized = path.normalize(name);
        const absolute = path.resolve(outputRoot, normalized);
        if (absolute !== outputRoot && !absolute.startsWith(outputRoot + path.sep)) {
            failures.push(`Screenshot escaped the test output directory: ${name}`);
            continue;
        }
        try {
            const bytes = await fsp.readFile(absolute);
            const info = pngInfo(bytes);
            if (!info || info.width < 1 || info.height < 1) {
                failures.push(`Screenshot is not a complete PNG: ${name}`);
                continue;
            }
            screenshots.push({ path: normalized.split(path.sep).join('/'), ...info });
        } catch (error) {
            failures.push(`Screenshot is missing: ${name}${error.code ? ` (${error.code})` : ''}`);
        }
    }
    return { screenshots, failures };
}

function hasVisualCoverage(screenshotFiles, system) {
    const names = screenshotFiles.filter(name => (system ? name.includes('system-') : !name.includes('system-')));
    return [390, 1280].every(width => ['light', 'dark'].every(theme => names.some(name => {
        const normalized = name.replace('new-light', 'light').replace('new-dark', 'dark');
        return normalized.includes(String(width)) && normalized.includes(theme);
    })));
}

function validSystemEvidence(value) {
    if (!Array.isArray(value) || value.length !== 4) return false;
    return [390, 1280].every(width => ['light', 'dark'].every(colorScheme => value.some(item => (
        item && item.width === width && item.colorScheme === colorScheme && item.theme === `new-${colorScheme}`
        && item.matchMedia === colorScheme && item.noHorizontalOverflow === true
    ))));
}

function parseBrowserResult(stdout) {
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (!lines[index].startsWith('{') || !lines[index].endsWith('}')) continue;
        try {
            const result = JSON.parse(lines[index]);
            if (result && typeof result === 'object') return result;
        } catch {
            // Keep looking for the final machine-readable result.
        }
    }
    return null;
}

function browserSummary(result) {
    if (!result) return null;
    const summary = {};
    for (const key of ['passed', 'checks', 'insecureHttp', 'requests', 'actualRequests', 'workerLoads', 'chaosMs', 'chaosTicks', 'backlog', 'backlogAtRequest', 'longProseMs', 'systemThemeEvidence']) {
        if (result[key] !== undefined) summary[key] = sanitizeReportValue(result[key]);
    }
    return summary;
}

function sanitizeReportValue(value) {
    if (typeof value === 'string') return SENSITIVE_REPORT_PATTERN.test(value) ? '[redacted]' : value;
    if (Array.isArray(value)) return value.map(sanitizeReportValue);
    if (value && typeof value === 'object') {
        const sanitized = {};
        for (const [key, child] of Object.entries(value)) {
            if (SENSITIVE_REPORT_PATTERN.test(`"${key}":`)) continue;
            sanitized[key] = sanitizeReportValue(child);
        }
        return sanitized;
    }
    return value;
}

function existingNpmCli() {
    const candidates = [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ];
    if (typeof process.env.npm_execpath === 'string' && /(?:^|[\\/])npm-cli\.js$/i.test(process.env.npm_execpath)) {
        candidates.push(process.env.npm_execpath);
    }
    return candidates.find(candidate => fs.existsSync(candidate));
}

function commandInvocation(command, args) {
    if (process.platform !== 'win32' || (command !== 'npm' && command !== 'npm.cmd')) return { command, args };
    const npmCli = existingNpmCli();
    if (npmCli) return { command: process.execPath, args: [npmCli, ...args] };
    if (args.some(arg => typeof arg !== 'string' || !/^[A-Za-z0-9_./:\\-]+$/.test(arg))) {
        throw new Error('Refusing to pass unsafe npm arguments through cmd.exe.');
    }
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')] };
}

export function defaultRunCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const invocation = commandInvocation(command, args);
        const child = spawn(invocation.command, invocation.args, {
            cwd: options.cwd,
            env: options.env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => resolve({ code: code ?? -1, stdout, stderr }));
    });
}

export async function assertPortAvailable(port) {
    await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
}

async function waitForHttp(url, child, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Local service exited before readiness with code ${child.exitCode}.`);
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
            if (response.ok) return;
            lastError = new Error(`Readiness returned HTTP ${response.status}.`);
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Local service did not become ready: ${lastError?.message || 'timeout'}`);
}

async function stopOwnChild(child) {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('close', resolve));
    child.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
}

async function startLocalServices(root) {
    await assertPortAvailable(8765);
    await assertPortAvailable(8766);
    const children = [];
    try {
        const app = spawn('python', ['-B', '-m', 'http.server', '8765', '--bind', '127.0.0.1'], {
            cwd: root,
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        children.push(app);
        const broker = spawn('python', ['-B', '-m', 'http.server', '8766', '--bind', '127.0.0.1', '--directory', 'card-runtime'], {
            cwd: root,
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });
        children.push(broker);
        await Promise.all([
            waitForHttp('http://127.0.0.1:8765/.sites-public/opentavern.html', app),
            waitForHttp('http://127.0.0.1:8766/index.html', broker),
        ]);
        return {
            appUrl: 'http://127.0.0.1:8765/.sites-public/opentavern.html',
            brokerUrl: 'http://127.0.0.1:8766/index.html',
            cleanup: async () => {
                await Promise.all(children.map(stopOwnChild));
                return 'removed';
            },
        };
    } catch (error) {
        await Promise.all(children.map(stopOwnChild));
        throw error;
    }
}

async function writeJson(file, value) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function htmlAssetParity(root) {
    const failures = [];
    const compared = [];
    const testedFiles = await listTreeFiles(root, '.sites-public');
    for (const testedPath of testedFiles) {
        const relative = testedPath.slice('.sites-public/'.length);
        const tested = await hashFile(root, testedPath);
        const packaged = await hashFile(root, `dist/client/${relative}`);
        if (tested.missing || packaged.missing || tested.sha256 !== packaged.sha256) {
            failures.push(relative);
        } else {
            compared.push({ path: relative, sha256: tested.sha256, bytes: tested.bytes });
        }
    }
    const html = await fsp.readFile(path.join(root, '.sites-public/opentavern.html'), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)) {
        const reference = match[1].replace(/^\.\//, '');
        if (/^(?:https?:|data:|javascript:)/.test(reference)) continue;
        const tested = await hashFile(root, `.sites-public/${reference}`);
        const packaged = await hashFile(root, `dist/client/${reference}`);
        if (tested.missing || packaged.missing || tested.sha256 !== packaged.sha256) failures.push(reference);
    }
    return { passed: failures.length === 0, compared, failures: [...new Set(failures)].sort() };
}

function addFailure(report, message) {
    report.failures.push(message);
    report.localGatePassed = false;
}

function finishReport(report) {
    report.localGatePassed = report.failures.length === 0;
    report.releaseDecision = {
        status: report.localGatePassed ? 'local-checks-passed-pending-independent-acceptance' : 'failed',
        publishable: false,
        note: '真实供应商与最终发布由协调者独立验收；本报告不授予发布资格。',
    };
    report.realProviderVerification = {
        status: 'not-run',
        passed: false,
        note: '检查工具只运行本地模拟与真实浏览器测试，不调用真实供应商。',
    };
    const serialized = JSON.stringify(report);
    if (SENSITIVE_REPORT_PATTERN.test(serialized)) {
        addFailure(report, 'Report contains a credential-like field or value.');
        report.releaseDecision.status = 'failed';
    }
    return report;
}

export function releaseExitCode(report) {
    return report.localGatePassed ? 0 : 1;
}

export async function runReleaseGate(options = {}) {
    const root = path.resolve(options.root || defaultRoot);
    const outputRoot = path.resolve(options.outputRoot || process.env.OPENTAVERN_TEST_OUTPUT || path.join(os.tmpdir(), 'opentavern-release'));
    const runDirectory = path.join(outputRoot, `release-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
    await fsp.mkdir(runDirectory, { recursive: true });
    const runCommand = options.runCommand || defaultRunCommand;
    const startServices = options.startServices || startLocalServices;
    const getRevision = options.sourceRevision ? async () => options.sourceRevision : (options.getRevision || gitRevision);
    const report = {
        schema: 1,
        title: 'OpenTavern local release gate',
        generatedAt: new Date().toISOString(),
        root,
        outputDirectory: runDirectory,
        source: null,
        artifacts: null,
        assetParity: null,
        commands: [],
        browserTests: [],
        services: { appUrl: null, brokerUrl: null, cleanup: 'absent' },
        failures: [],
        unexecuted: [],
    };
    let services = null;

    try {
        report.source = {
            revision: await getRevision(root),
            controlledTreeBefore: await collectSourceState(root, options),
        };
        report.artifacts = { beforeBuild: await collectArtifactState(root) };

        for (const name of REQUIRED_BROWSER_TESTS) {
            if (!fs.existsSync(path.join(root, 'scripts', name))) addFailure(report, `Required browser test is missing: ${name}`);
        }

        async function command(step, commandName, args) {
            const started = Date.now();
            const result = await runCommand(commandName, args, { cwd: root, env: process.env });
            const row = {
                step,
                command: [commandName, ...args].join(' '),
                exitCode: result.code,
                durationMs: Date.now() - started,
                stdoutBytes: Buffer.byteLength(result.stdout || ''),
                stderrBytes: Buffer.byteLength(result.stderr || ''),
                status: result.code === 0 ? 'passed' : 'failed',
                diagnosticTail: result.code === 0 ? null : sanitizeReportValue((result.stderr || result.stdout || '').split(/\r?\n/).slice(-24).join('\n')),
            };
            report.commands.push(row);
            if (result.code !== 0) addFailure(report, `${step} failed with exit code ${result.code}.`);
            return result;
        }

        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const buildResult = await command('build:sites', npm, ['run', 'build:sites']);
        report.artifacts.afterBuild = await collectArtifactState(root);
        if (buildResult.code === 0) {
            const missingAfterBuild = missingCoreArtifacts(report.artifacts.afterBuild);
            if (missingAfterBuild.length) addFailure(report, `Required artifacts are missing after build:sites: ${missingAfterBuild.join(', ')}`);
        }

        await command('source checks', npm, ['run', 'check']);
        await command('Sites artifact checks', npm, ['run', 'check:sites']);
        report.artifacts.afterChecks = await collectArtifactState(root);
        if (!sameFiles(report.artifacts.afterBuild, report.artifacts.afterChecks)) {
            addFailure(report, 'Source checks changed the complete artifact byte map.');
        }
        report.source.controlledTreeAfterChecks = await collectSourceState(root, options);
        if (!sameFiles(report.source.controlledTreeBefore, report.source.controlledTreeAfterChecks)) {
            addFailure(report, 'Controlled source tree drifted during build and source checks.');
        }

        if (report.failures.length > 0) {
            report.unexecuted.push('Browser matrix and asset parity were not executed because a prerequisite failed.');
        } else {
            try {
                services = await startServices(root);
                report.services.appUrl = services.appUrl;
                report.services.brokerUrl = services.brokerUrl;
            } catch (error) {
                addFailure(report, `Local service startup failed: ${error.message}`);
            }
        }

        if (services) {
            for (const name of REQUIRED_BROWSER_TESTS) {
                const script = `scripts/${name}`;
                const testDirectory = path.join(runDirectory, name.replace(/\.mjs$/, ''));
                await fsp.mkdir(testDirectory, { recursive: true });
                const testStarted = Date.now();
                const result = await runCommand('node', [script], {
                    cwd: root,
                    env: {
                        ...process.env,
                        OPENTAVERN_TEST_URL: services.appUrl,
                        OPENTAVERN_TEST_OUTPUT: testDirectory,
                    },
                });
                const parsed = parseBrowserResult(result.stdout || '');
                const screenshotNames = Array.isArray(parsed?.screenshotFiles) ? parsed.screenshotFiles : [];
                const screenshotResult = await inspectScreenshots(root, testDirectory, screenshotNames);
                const row = {
                    name,
                    command: `node ${script}`,
                    exitCode: result.code,
                    outputDirectory: testDirectory,
                    diagnosticTail: result.code === 0 ? null : sanitizeReportValue((result.stderr || result.stdout || '').split(/\r?\n/).slice(-24).join('\n')),
                    durationMs: Date.now() - testStarted,
                    reportPath: `${name.replace(/\.mjs$/, '')}.report.json`,
                    summary: browserSummary(parsed),
                    screenshots: screenshotResult.screenshots,
                    assertions: {
                        exitZero: result.code === 0,
                        machineReadablePassed: parsed?.passed === true,
                        explicit390And1280LightDark: hasVisualCoverage(screenshotNames, false),
                        system390And1280LightDark: hasVisualCoverage(screenshotNames, true),
                        systemThemeSwitchObserved: validSystemEvidence(parsed?.systemThemeEvidence),
                        screenshotsComplete: screenshotResult.failures.length === 0 && screenshotNames.length > 0,
                    },
                };
                report.browserTests.push(row);
                await writeJson(path.join(runDirectory, row.reportPath), row);
                if (result.code !== 0) addFailure(report, `${name} failed with exit code ${result.code}.`);
                if (parsed?.passed !== true) addFailure(report, `${name} did not provide a passing machine-readable report.`);
                for (const failure of screenshotResult.failures) addFailure(report, `${name}: ${failure}`);
                if (!row.assertions.explicit390And1280LightDark) addFailure(report, `${name} is missing explicit 390/1280 light/dark screenshots.`);
                if (!row.assertions.system390And1280LightDark) addFailure(report, `${name} is missing 390/1280 system light/dark screenshots.`);
                if (!row.assertions.systemThemeSwitchObserved) addFailure(report, `${name} did not report observed system theme switching.`);
            }

            report.artifacts.afterBrowser = await collectArtifactState(root);
            if (!sameFiles(report.artifacts.afterChecks, report.artifacts.afterBrowser)) {
                addFailure(report, 'Browser tests changed the complete artifact byte map.');
            }
            report.source.controlledTreeAfter = await collectSourceState(root, options);
            if (!sameFiles(report.source.controlledTreeBefore, report.source.controlledTreeAfter)) {
                addFailure(report, 'Controlled source tree drifted during the release gate.');
            }
            report.assetParity = await htmlAssetParity(root);
            if (!report.assetParity.passed) addFailure(report, 'Tested .sites-public assets differ from packaged dist/client assets.');
        } else {
            if (!report.unexecuted.length) report.unexecuted.push('All required browser tests were not executed because local service startup failed.');
        }
    } catch (error) {
        addFailure(report, `Release gate error: ${error.message}`);
        report.unexecuted.push('Remaining release checks were not executed after the gate error.');
    } finally {
        if (services?.cleanup) {
            try {
                report.services.cleanup = await services.cleanup();
            } catch (error) {
                report.services.cleanup = 'failed';
                addFailure(report, `Local service cleanup failed: ${error.message}`);
            }
        }
    }

    finishReport(report);
    await writeJson(path.join(runDirectory, 'release-report.json'), report);
    return report;
}

async function main() {
    const report = await runReleaseGate();
    console.log(JSON.stringify({
        localGatePassed: report.localGatePassed,
        outputDirectory: report.outputDirectory,
        reportPath: path.join(report.outputDirectory, 'release-report.json'),
        failures: report.failures,
        realProviderVerification: report.realProviderVerification,
        releaseDecision: report.releaseDecision,
    }, null, 2));
    process.exitCode = releaseExitCode(report);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
