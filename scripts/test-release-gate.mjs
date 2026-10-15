import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_BROWSER_TESTS, assertPortAvailable, defaultRunCommand, releaseExitCode, runReleaseGate } from './check-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkReleaseSource = await fs.readFile(path.join(root, 'scripts/check-release.mjs'), 'utf8');
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

async function writeFixtureFile(rootPath, relative, content) {
    const target = path.join(rootPath, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
}

async function writeGeneratedFixtureFiles(rootPath) {
    await writeFixtureFile(rootPath, 'offline-manifest.json', '{"formatVersion":1}');
    await writeFixtureFile(rootPath, 'opentavern-sw.js', '// fixture offline worker');
    await writeFixtureFile(rootPath, 'assets/js/app.js', 'fixture-app');
    await writeFixtureFile(rootPath, 'assets/css/app.css', 'fixture-css');
    await writeFixtureFile(rootPath, 'index.html', '<script src="assets/js/app.js"></script>');
    const html = '<link href="assets/css/app.css"><link href="assets/css/tailwind.css"><script src="assets/js/app.js"></script>';
    for (const tree of ['.sites-public', 'dist/client']) {
        await writeFixtureFile(rootPath, `${tree}/offline-manifest.json`, '{"formatVersion":1}');
        await writeFixtureFile(rootPath, `${tree}/opentavern-sw.js`, '// fixture offline worker');
        await writeFixtureFile(rootPath, `${tree}/opentavern.html`, html);
        await writeFixtureFile(rootPath, `${tree}/assets/js/app.js`, 'fixture-app');
        await writeFixtureFile(rootPath, `${tree}/assets/css/app.css`, 'fixture-css');
        await writeFixtureFile(rootPath, `${tree}/assets/css/tailwind.css`, 'fixture-tailwind');
        await writeFixtureFile(rootPath, `${tree}/assets/js/purify.min.js`, 'fixture-purify');
        await writeFixtureFile(rootPath, `${tree}/assets/js/marked.umd.js`, 'fixture-marked');
    }
    await writeFixtureFile(rootPath, 'dist/server/index.js', 'fixture-worker');
    await writeFixtureFile(rootPath, 'dist/server/wrangler.json', '{}');
    await writeFixtureFile(rootPath, 'dist/.openai/hosting.json', '{}');
    await writeFixtureFile(rootPath, 'dist/.openai/drizzle/0001.sql', 'CREATE TABLE fixture;');
}

async function createFixture(parent, name, scenario) {
    const fixture = path.join(parent, name);
    await fs.mkdir(fixture, { recursive: true });
    await writeFixtureFile(fixture, 'scripts/check-release.mjs', checkReleaseSource);
    await writeFixtureFile(fixture, 'scenario.json', JSON.stringify(scenario));
    await writeFixtureFile(fixture, 'package.json', JSON.stringify({
        private: true,
        scripts: {
            'build:sites': 'fixture build',
            check: 'fixture check',
            'check:sites': 'fixture check:sites',
            'check:release': 'node scripts/check-release.mjs',
        },
    }, null, 2));
    await writeFixtureFile(fixture, 'src/source.js', 'export const source = 1;\n');
    if (!scenario.cleanCheckout) await writeGeneratedFixtureFiles(fixture);
    for (const browserName of REQUIRED_BROWSER_TESTS) await writeFixtureFile(fixture, `scripts/${browserName}`, 'fixture marker\n');
    return fixture;
}

function fixtureRunCommand(fixture, scenario) {
    return async (command, args, options = {}) => {
        const commandName = path.basename(command).toLowerCase();
        const npmArgs = commandName === 'npm' || commandName === 'npm.cmd'
            ? args
            : commandName === path.basename(process.execPath).toLowerCase() && args[0]?.toLowerCase().endsWith('npm-cli.js')
                ? args.slice(1)
                : null;
        if (npmArgs) {
            const step = npmArgs.join(' ');
            if (step === 'run build:sites' && scenario.buildGeneratesArtifacts) await writeGeneratedFixtureFiles(fixture);
            if (step === 'run check' && scenario.checkMutatesSource) await fs.appendFile(path.join(fixture, 'src/source.js'), 'changed');
            if (step === 'run check:sites' && scenario.checkMutatesPackagedAsset) await fs.appendFile(path.join(fixture, 'dist/client/assets/js/app.js'), 'changed');
            return { code: 0, stdout: 'fixture command\n', stderr: '' };
        }
        const match = args.join(' ').match(/scripts[\\/](test-[^ ]+\.mjs)$/);
        if (!match) return { code: 2, stdout: '', stderr: 'unexpected fixture command' };
        const browserName = match[1];
        if (scenario.failTest === browserName) return { code: 1, stdout: '', stderr: 'browser dependency missing' };
        if (scenario.noJsonTest === browserName) return { code: 0, stdout: 'no machine report\n', stderr: '' };

        if (scenario.browserMutatesArtifact && browserName === REQUIRED_BROWSER_TESTS[0]) {
            await fs.appendFile(path.join(fixture, 'assets/js/app.js'), 'changed');
        }
        if (scenario.browserMutatesSource && browserName === REQUIRED_BROWSER_TESTS[0]) {
            await fs.appendFile(path.join(fixture, 'src/source.js'), 'changed');
        }

        const prefix = browserName.replace(/\.mjs$/, '');
        const screenshotFiles = [];
        for (const width of [390, 1280]) {
            for (const theme of ['new-light', 'new-dark']) screenshotFiles.push(`${prefix}-${width}-${theme}.png`);
            for (const colorScheme of ['light', 'dark']) screenshotFiles.push(`${prefix}-system-${width}-${colorScheme}.png`);
        }
        if (scenario.missingScreenshot && browserName === REQUIRED_BROWSER_TESTS[0]) screenshotFiles.pop();
        for (const screenshotFile of screenshotFiles) {
            await fs.writeFile(path.join(options.env.OPENTAVERN_TEST_OUTPUT, screenshotFile), pngBytes);
        }
        if (scenario.mutateTestedAsset && browserName === REQUIRED_BROWSER_TESTS[0]) {
            await fs.appendFile(path.join(fixture, '.sites-public/assets/js/app.js'), 'changed');
        }
        return {
            code: 0,
            stderr: '',
            stdout: `${JSON.stringify({
                passed: true,
                screenshotFiles,
                systemThemeEvidence: [390, 1280].flatMap(width => ['light', 'dark'].map(colorScheme => ({
                    width,
                    colorScheme,
                    theme: `new-${colorScheme}`,
                    matchMedia: colorScheme,
                    noHorizontalOverflow: true,
                }))),
                checks: scenario.secretOutput && browserName === REQUIRED_BROWSER_TESTS[0]
                    ? ['Authorization: Bearer fixture-secret']
                    : ['fixture assertion'],
            })}\n`,
        };
    };
}

async function runFixture(parent, name, scenario) {
    const fixture = await createFixture(parent, name, scenario);
    const serviceState = { startCalls: 0, cleanupCalls: 0 };
    const report = await runReleaseGate({
        root: fixture,
        outputRoot: path.join(fixture, 'test-output'),
        runCommand: fixtureRunCommand(fixture, scenario),
        sourceRevision: 'fixture-revision',
        listControlledFiles: async () => ['package.json', 'src/source.js'],
        startServices: async () => {
            serviceState.startCalls += 1;
            return {
                appUrl: 'fixture://app/.sites-public/opentavern.html',
                brokerUrl: 'fixture://broker/index.html',
                cleanup: async () => {
                    serviceState.cleanupCalls += 1;
                    return 'removed';
                },
            };
        },
    });
    return { code: releaseExitCode(report), report, fixture, serviceState };
}

async function removeFixtureTree(target) {
    const resolved = path.resolve(target);
    const temp = path.resolve(os.tmpdir());
    assert.equal(resolved.startsWith(temp + path.sep), true, `Refusing to remove fixture outside the temp directory: ${resolved}`);
    await fs.rm(resolved, { recursive: true, force: true });
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'opentavern-release-gate-'));
let passed = 0;
try {
    {
        const { code, report } = await runFixture(temp, 'success', {});
        assert.equal(code, 0, report.failures.join('\n'));
        assert.equal(report.localGatePassed, true);
        assert.equal(report.realProviderVerification.status, 'not-run');
        assert.equal(report.realProviderVerification.passed, false);
        assert.equal(report.releaseDecision.publishable, false);
        assert.equal(report.artifacts.afterBuild.files['dist/client/assets/css/app.css'].missing, undefined);
        await fs.access(path.join(report.outputDirectory, 'release-report.json'));
        passed += 1;
    }
    {
        const { code, report } = await runFixture(temp, 'clean-checkout', { cleanCheckout: true, buildGeneratesArtifacts: true });
        assert.equal(code, 0, report.failures.join('\n'));
        assert.equal(report.artifacts.beforeBuild.files['.sites-public/opentavern.html'].missing, true);
        assert.equal(report.artifacts.beforeBuild.files['dist/client/assets/css/app.css'].missing, true);
        assert.equal(report.artifacts.afterBuild.files['dist/client/assets/css/app.css'].missing, undefined);
        assert.notEqual(report.artifacts.beforeBuild.sha256, report.artifacts.afterBuild.sha256);
        passed += 1;
    }
    {
        const fixture = await createFixture(temp, 'missing-test', {});
        await fs.rm(path.join(fixture, `scripts/${REQUIRED_BROWSER_TESTS[2]}`));
        const report = await runReleaseGate({
            root: fixture,
            outputRoot: path.join(fixture, 'test-output'),
            runCommand: fixtureRunCommand(fixture, {}),
            sourceRevision: 'fixture-revision',
            listControlledFiles: async () => ['package.json', 'src/source.js'],
            startServices: async () => { throw new Error('must not start'); },
        });
        assert.equal(releaseExitCode(report), 1);
        assert.match(report.failures.join('\n'), /Required browser test is missing/);
        passed += 1;
    }
    for (const [name, scenario, pattern] of [
        ['dependency-failure', { failTest: REQUIRED_BROWSER_TESTS[0] }, /exit code 1/],
        ['missing-report', { noJsonTest: REQUIRED_BROWSER_TESTS[1] }, /machine-readable report/],
        ['missing-screenshot', { missingScreenshot: true }, /system light\/dark screenshots/],
        ['source-check-drift', { checkMutatesSource: true }, /Controlled source tree drifted/],
        ['source-browser-drift', { browserMutatesSource: true }, /Controlled source tree drifted/],
        ['after-checks-drift', { checkMutatesPackagedAsset: true }, /Source checks changed the complete artifact byte map/],
        ['after-browser-drift', { browserMutatesArtifact: true }, /Browser tests changed the complete artifact byte map/],
    ]) {
        const { code, report, serviceState } = await runFixture(temp, name, scenario);
        assert.equal(code, 1, `${name} must map to a non-zero exit code`);
        assert.equal(report.localGatePassed, false);
        assert.match(report.failures.join('\n'), pattern, name);
        if (name === 'dependency-failure') {
            assert.equal(serviceState.startCalls, 1);
            assert.equal(serviceState.cleanupCalls, 1);
            assert.equal(report.services.cleanup, 'removed');
        }
        passed += 1;
    }
    {
        const { code, report } = await runFixture(temp, 'tested-asset-drift', { mutateTestedAsset: true });
        assert.equal(code, 1);
        assert.match(report.failures.join('\n'), /Browser tests changed the complete artifact byte map/);
        assert.match(report.failures.join('\n'), /assets differ from packaged/);
        assert.equal(report.assetParity.passed, false);
        assert.match(report.assetParity.failures.join('\n'), /assets\/js\/app\.js/);
        passed += 1;
    }
    {
        const { code, report } = await runFixture(temp, 'report-redaction', { secretOutput: true });
        assert.equal(code, 0);
        assert.equal(JSON.stringify(report).includes('fixture-secret'), false);
        assert.equal(JSON.stringify(report).includes('Authorization: Bearer'), false);
        assert.equal(report.realProviderVerification.passed, false);
        passed += 1;
    }
    {
        const occupied = net.createServer();
        await new Promise((resolve, reject) => occupied.once('error', reject).listen(0, '127.0.0.1', resolve));
        try {
            const port = occupied.address().port;
            await assert.rejects(
                () => assertPortAvailable(port),
                error => error?.code === 'EADDRINUSE',
                `Port ${port} must remain owned by the existing server`,
            );
            assert.equal(occupied.listening, true, 'The pre-existing service must remain alive.');
            assert.notEqual(occupied.address(), null, 'The pre-existing service must remain bound.');
            passed += 1;
        } finally {
            await new Promise(resolve => occupied.close(resolve));
        }
    }
    let npmLaunchSmoke = 'passed';
    try {
        const result = await defaultRunCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { cwd: root });
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout.trim(), /\d+\.\d+\.\d+/);
        passed += 1;
    } catch (error) {
        if (error.code !== 'EPERM') throw error;
        npmLaunchSmoke = `not-run (${error.code})`;
    }
    console.log(`Release gate fixtures passed (${passed} checks) with in-process command/service stand-ins: clean-checkout generation, missing test/report/screenshot, dependency failure, source/after-checks/after-browser/tested-asset drift, redaction, real-provider status, cleanup, exit mapping, and dynamic port ownership.`);
    console.log(`Real npm launch smoke: ${npmLaunchSmoke}.`);
} finally {
    await removeFixtureTree(temp);
}
