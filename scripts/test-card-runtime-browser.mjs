import { captureBrowserEvidence } from './check-release.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.OPENTAVERN_PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const base = 'http://opentavern.test:8765';
const broker = 'http://127.0.0.1:8766';
const output = process.env.OPENTAVERN_TEST_OUTPUT || await mkdtemp(path.join(os.tmpdir(), 'opentavern-f18-f19-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP opentavern.test 127.0.0.1', '--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage(), errors = [], external = [], navigations = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type()==='error') console.log('BROWSER:', message.text()); });
await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/assets/js/app.js')) {
        const response = await route.fetch({ url: 'http://127.0.0.1:8765' + url.pathname + url.search }), text = await response.text(), end = text.lastIndexOf('})();');
        const probe = 'Object.assign(window,{state,dom,getActiveConv,normalizeConversation,requestFullRender,switchView,applyUiTheme,renderMessagesOnly,renderAssistantContent,getMvuDataForMessage,cardRuntimeEntries,cardRuntimeInstances,cardRuntimeGrants,prepareCardRuntimeGrant,activateCardRuntimeGrant,mountCardRuntimeFrames,stopCardRuntimeInstances,cardRuntimeDigest,prepareCardRuntimeExecution,StorageService});\n';
        return route.fulfill({ response, body: text.slice(0, end) + probe + text.slice(end) });
    }
    if (url.origin === broker && url.pathname === '/config.js') return route.fulfill({ contentType: 'application/javascript', body: `window.CARD_BROKER_PARENT_ORIGINS=${JSON.stringify([base])};` });
    if (url.pathname === '/fixture/main.js') return route.fulfill({ contentType: 'application/javascript', body: "import {value} from './child.js'; window.moduleStarts=(window.moduleStarts||0)+1; document.querySelector('#module-result').textContent=value; export const main=1;" });
    if (url.pathname === '/fixture/child.js') return route.fulfill({ contentType: 'application/javascript', body: "import './main.js'; export const value='闭包完成';" });
    if (url.pathname === '/fixture/jquery-plugin.js') return route.fulfill({ contentType: 'application/javascript', body: "window.pluginLoaded=true;" });
    if (url.pathname === '/fixture/network') return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': broker }, body: '{"message":"联网完成"}' });
    if (url.pathname === '/fixture/navigation') { navigations.push(url.href); return route.fulfill({ contentType: 'text/html', body: '<p>Navigation fixture</p>' }); }
    if (![base, broker].includes(url.origin)) { external.push(url.href); return route.abort(); }
    return route.continue();
});
await page.addInitScript(() => { if (window !== top) return; localStorage.setItem('opentavern_onboarding_completed_v1','1'); localStorage.setItem('opentavern_announce_dismissed_v1','1'); });
async function install(source) {
    await page.evaluate(text => {
        stopCardRuntimeInstances('test fixture', { revoke: true }); cardRuntimeGrants.clear();
        const conv = getActiveConv(); conv.character = { name: '兼容验收卡', extensions: { mvu: { initvar: { energy: 1 } } } }; delete conv.mvu;
        conv.messages = [{ id: 'greeting', role: 'assistant', content: '初值：{{get_message_variable::energy}}' }, { id: 'card', role: 'assistant', content: text }]; conv.summaries = [];
        normalizeConversation(conv); requestFullRender(); switchView('chat'); window.hostSecret='host-only';
    }, source);
    await page.locator('[data-action="card-runtime-run"]').waitFor();
}
let childDepth = 1;
async function authorize(level, permissions = {}, network = {}) {
    childDepth = level==='L3' ? 2 : 1;
    await page.evaluate(async selection => {
        const element = document.querySelector('section.card-runtime'), entry = cardRuntimeEntries.get(element.dataset.cardRuntimeToken);
        const grant = await prepareCardRuntimeGrant(entry, selection, new AbortController().signal); activateCardRuntimeGrant(entry, grant); mountCardRuntimeFrames(dom.messagesContainer);
    }, { level, permissions, network });
    try { await page.waitForFunction(() => Array.from(cardRuntimeInstances.values()).some(instance => !!instance.port), null, {timeout:15000}); } catch(error) { console.log(await page.locator('[data-card-runtime-status]').allTextContents(), errors, page.frames().map(frame=>frame.url())); throw error; }
}
async function child() { for (let i=0;i<100;i++) { const frames=page.frames().filter(frame=>frame!==page.mainFrame()); if(frames.length>=childDepth) return frames.at(-1); await page.waitForTimeout(50); } throw new Error('Child frame unavailable'); }
try {
    await page.goto(base + '/.sites-public/opentavern.html'); await page.waitForFunction(() => typeof cardRuntimeDigest === 'function' && getActiveConv());
    assert.equal(await page.evaluate(() => isSecureContext), false, 'Exercise a real insecure HTTP origin.');
    assert.equal(await page.evaluate(() => !!crypto.subtle), false);
    assert.equal(await page.evaluate(() => cardRuntimeDigest('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const card = '<JSONPatch>[{"op":"delta","path":"/energy","value":2}]</JSONPatch><div><p>精力 <span id="value"></span></p><button id="add">增加</button><p id="isolated"></p></div><script>document.querySelector("#value").textContent=getvar("energy");try{document.querySelector("#isolated").textContent=parent.hostSecret}catch(e){document.querySelector("#isolated").textContent="已隔离"}document.querySelector("#add").onclick=async()=>{await updateVariablesWith(data=>{data.stat_data.energy+=1});document.querySelector("#value").textContent=getvar("energy")};</script>';
    await install(card);
    assert.equal(page.frames().length, 1, 'Default rendering cannot execute a card.');
    assert.equal(await page.evaluate(() => getMvuDataForMessage(getActiveConv(),null).stat_data.energy), 3);
    childDepth=1;
    await page.locator('[data-action="card-runtime-run"]').click();
    const permissionDialog=page.locator('#cardRuntimePermissionDialog');
    assert.equal(await permissionDialog.locator('input[type=checkbox]:checked').count(),1, 'Only GET is preselected in the hidden network section.');
    await permissionDialog.locator('[data-runtime-level]').selectOption('L1');
    await permissionDialog.locator('[data-runtime-permission="variables.read"]').check();
    await permissionDialog.locator('[data-runtime-permission="variables.write.current"]').check();
    await permissionDialog.getByRole('button',{name:'准备并审核',exact:true}).click();
    const reviewDialog=page.locator('#cardRuntimeReviewDialog');
    await reviewDialog.getByRole('button',{name:'确认运行',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('#cardRuntimeReviewDialog button[type=submit]').disabled);
    assert.match(await reviewDialog.locator('code').first().textContent(),/^[a-f0-9]{64}$/);
    assert.equal(page.frames().length,1,'Preparation cannot execute reviewed card code.');
    await reviewDialog.getByRole('button',{name:'确认运行',exact:true}).click();
    await page.waitForFunction(()=>Array.from(cardRuntimeInstances.values()).some(instance=>!!instance.port));
    let frame = await child(); assert.equal(await frame.locator('#value').textContent(), '3'); assert.equal(await frame.locator('#isolated').textContent(), '已隔离');
    assert.equal(await frame.evaluate(() => typeof _.get === 'function' && $.fn.jquery === '3.7.1'), true);
    await frame.locator('#add').click(); await page.waitForFunction(() => getMvuDataForMessage(getActiveConv(),null).stat_data.energy===4);
    assert.equal(await frame.locator('#value').textContent(), '4');
    assert.equal(await page.locator('[data-action="card-runtime-run"]').isVisible(), false);
    await page.waitForFunction(() => parseFloat(document.querySelector('.card-runtime-frame').style.height) <= 250);
    for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['new-light','new-dark']) {
            await page.evaluate(value => applyUiTheme(value), theme);
            await frame.waitForFunction(expected => document.documentElement.style.getPropertyValue('--card-runtime-scheme') === expected, theme === 'new-light' ? 'light' : 'dark');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth), true);
            await page.screenshot({ path: path.join(output, `card-${width}-${theme}.png`), animations: 'disabled' });
        }
    }
    await page.emulateMedia({ colorScheme: 'light' }); await page.evaluate(() => applyUiTheme('system'));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--card-runtime-scheme') === 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--card-runtime-scheme') === 'dark');
    await page.locator('[data-action="card-runtime-revoke"]').click();
    await page.waitForFunction(() => cardRuntimeInstances.size===0);
    assert.equal(await page.evaluate(() => getMvuDataForMessage(getActiveConv(),null).stat_data.energy),4);
    await page.setViewportSize({width:390,height:900}); await page.locator('[data-action="card-runtime-run"]').click(); await page.locator('dialog[open]').waitFor();
    assert.equal(await page.locator('[data-runtime-network]').isVisible(),false);
    await page.screenshot({ path: path.join(output,'authorization-mobile.png') }); await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(),0); assert.equal(page.frames().length,1);
    await install('<div id="module-result">待加载</div><script type="module" src="/fixture/main.js"></script><script src="/fixture/jquery-plugin.js"></script>');
    await authorize('L2'); frame = await child(); await frame.locator('#module-result').filter({ hasText: '闭包完成' }).waitFor();
    assert.equal(await frame.evaluate(() => window.moduleStarts),1, 'Cycle entry must have one module identity.');
    assert.equal(await frame.evaluate(() => window.pluginLoaded),true, 'A jquery-named plugin cannot be silently discarded.');
    const rejected = await page.evaluate(async () => {
        try { await prepareCardRuntimeExecution('<script type="module">import(window.location.href)</script>','L2',{signal:new AbortController().signal}); return ''; } catch(error) { return error.message; }
    }); assert.match(rejected,/表达式动态导入/);
    await install(`<button id="network">联网</button><p id="network-result"></p><script>document.querySelector('#network').onclick=async()=>{try{const result=await fetch('${base}/fixture/network');document.querySelector('#network-result').textContent=(await result.json()).message}catch(e){document.querySelector('#network-result').textContent=e.message}}</script>`);
    await authorize('L3', { 'network.fetch': true }, { brokerUrl: broker + '/index.html', origins: [base], methods: ['GET'] });
    frame = await child(); await frame.locator('#network').click(); await frame.locator('#network-result').filter({ hasText:'联网完成' }).waitFor();
    await page.evaluate(() => applyUiTheme('new-light'));
    await frame.waitForFunction(() => document.documentElement.style.getPropertyValue('--card-runtime-scheme') === 'light');
    await page.waitForFunction(() => parseFloat(document.querySelector('.card-runtime-frame').style.height) <= 250);
    await page.locator('[data-action="card-runtime-revoke"]').click(); await page.waitForFunction(() => cardRuntimeInstances.size===0);
    await install(`<button id="navigate">导航</button><script>document.querySelector('#navigate').onclick=()=>{location.href='${base}/fixture/navigation'}</script>`);
    await authorize('L0'); frame = await child(); await frame.locator('#navigate').click();
    await page.waitForFunction(() => cardRuntimeInstances.size===0);
    assert.equal(navigations.length, 1, 'Iframe self-navigation can issue a request before its load triggers cleanup.');
    assert.match(await page.locator('[data-card-runtime-status]').textContent(), /导航.*停止/);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed:true, insecureHttp:true, screenshots:output, ...(await captureBrowserEvidence(page, output)), checks:['default static','L1/MVU ACK','source isolation','revoke','dialog cancel','light/dark/mobile/system','content height','L2 cyclic closure','dynamic import rejection','L3 two-origin HTTP fetch','self-navigation cleanup and limitation'] }));
} finally { await context.close(); await browser.close(); }
