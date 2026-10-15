import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const copy = (value) => JSON.parse(JSON.stringify(value));
const read = (name) => fs.readFileSync(new URL('../src/app/' + name, import.meta.url), 'utf8');

// 真实运行时分片：可靠保存（persistState）、世界书/角色卡解析与公共卡导入 UI 都按 manifest 顺序加载。
const files = [
    'worldbook/41-world-info-constants.js',
    'worldbook/41-world-info-position.js',
    'worldbook/41-world-info-extension-fields.js',
    'worldbook/41-world-info-normalizer.js',
    'worldbook/42-worldbook-import-format.js',
    'character/40-character-card-import.js',
    'character/40-character-book-import.js',
    'prompt/40-character-regex-runtime.js',
    'state/35-persist-records.js',
    'state/35-state-persistence.js',
    'state/35-persist-snapshot-helpers.js',
    'library/60-public-card-assets.js',
    'library/60-public-card-import-helpers.js',
    'library/60-public-card-import-ui.js'
];

const meta = { name: 'Hero', jsonUrl: 'cards/hero.json', previewImage: 'cards/hero.png', author: 'Tester' };

function buildCard(overrides = {}) {
    const card = Object.assign({ spec: 'chara_card_v2' }, overrides);
    card.data = Object.assign({
        name: 'Hero',
        description: 'imported description',
        first_mes: 'hi',
        character_book: { name: 'Hero Lore', entries: [{ keys: ['alpha'], content: 'entry one' }] }
    }, overrides.data);
    return card;
}

function cardWithRegex() {
    return buildCard({ data: { extensions: { regex_scripts: [{ findRegex: 'a', replaceString: 'b' }] } } });
}

function createHarness(overrides = {}) {
    const writes = [];
    const alerts = [];
    const toasts = [];
    const events = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        setTimeout: () => 0,
        clearTimeout: () => {},
        Promise, Date, JSON, Math, Object, Array, Number, String, Set,
        makeId: (() => { let n = 0; return () => 'id-' + (++n); })(),
        t: (key) => key,
        alert: (message) => alerts.push(message),
        window: {},
        document: {
            getElementById: () => null,
            createElement: () => ({ className: '', textContent: '', style: {}, remove() {} }),
            body: { appendChild: (el) => { toasts.push(el); } }
        },
        LocalResourceManager: {
            resolvePublicUrl: (url) => url,
            isPublicPrepared: () => true,
            readPublic: async (url) => {
                events.push('read');
                return { ok: true, status: 200, json: async () => copy(ctx.cardJson) };
            }
        },
        currentView: 'library',
        renderLibraryGrids() { events.push('render'); },
        requestFullRender() { events.push('full-render'); },
        getSafeSettingsForPersist: () => copy(ctx.state.settings),
        getCloudSyncPortableSettings: (value) => copy(value),
        getConversationIdsWithMissingFallback: (order, conversations) => [...new Set([...(order || []), ...Object.keys(conversations || {})])].filter((key) => conversations && conversations[key]),
        getValidConversationIdOrFallback: (active, order, conversations) => conversations && conversations[active] ? active : (order || [])[0],
        updateStorageInfo() {},
        scheduleCloudSyncUpload() {},
        showGlassConfirm: async () => { events.push('consent'); return ctx.confirmAnswer; },
        StorageService: {
            _lastSaveSnapshot: null,
            _cloneForPersist: copy,
            _isQuotaError: () => false,
            async saveAll(snapshot) {
                events.push('save');
                writes.push(copy(snapshot));
                if (ctx.saveMode === 'fail') throw new Error('quota failure');
                if (ctx.saveMode === 'refused') return { refusedEmpty: true };
                if (ctx.saveMode === 'held') {
                    ctx.durable = copy(snapshot);
                    return await new Promise((resolve) => { ctx.releaseSave = () => resolve({ runtimeSnapshot: copy(snapshot) }); });
                }
                ctx.durable = copy(snapshot);
                return { runtimeSnapshot: copy(snapshot) };
            }
        }
    };
    ctx.state = Object.assign({
        settings: { model: 'local' },
        conversations: { c1: { id: 'c1', messages: [], summaries: [] } },
        conversationOrder: ['c1'],
        activeConvId: 'c1',
        worldBooks: {},
        characters: {},
        _charactersMigrated: true
    }, overrides.state || {});
    ctx.dom = { cardLibraryModal: { classList: { add() { events.push('modal-hidden'); } } } };
    ctx.cardJson = overrides.cardJson || buildCard();
    ctx.confirmAnswer = overrides.confirmAnswer !== undefined ? overrides.confirmAnswer : true;
    ctx.saveMode = overrides.saveMode || 'ok';
    ctx.durable = undefined;
    ctx.releaseSave = null;
    vm.createContext(ctx);
    for (const file of files) vm.runInContext(read(file), ctx, { filename: file });
    return { ctx, writes, alerts, toasts, events };
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error(message || 'timed out waiting for condition');
        await new Promise((resolve) => setImmediate(resolve));
    }
}

const idleHero = () => ({ characters: { hero: { name: 'Hero', description: 'original' } } });

// 1. 成功后角色与世界书都提交到 live state，并给出成功提示。
{
    const h = createHarness({ state: idleHero() });
    const result = await h.ctx.importPublicCard(meta);
    assert.equal(result && result.name, 'Hero', 'Import must return the imported character.');
    assert.equal(h.ctx.state.characters.hero.description, 'imported description');
    assert.equal(h.ctx.state.characters.hero.author, 'Tester');
    assert.equal(h.ctx.state.characters.hero.previewImage, 'cards/hero.png');
    const bookIds = Object.keys(h.ctx.state.worldBooks);
    assert.equal(bookIds.length, 1, 'A single embedded world book should be committed.');
    assert.match(bookIds[0], /^wb-/, 'World book ids must keep the wb-Date-Random convention.');
    const book = h.ctx.state.worldBooks[bookIds[0]];
    assert.equal(book.name, 'Hero Lore');
    assert.equal(book.entries['0'].content, 'entry one');
    assert.equal(typeof book.created, 'number');
    assert.equal(h.alerts.length, 0);
    assert.equal(h.toasts.length, 1, 'A successful import shows exactly one toast.');
    assert.ok(h.ctx.durable.characters.hero.description === 'imported description');
    assert.ok(h.ctx.durable.worldBooks[bookIds[0]], 'Durable snapshot must contain the world book.');
}

// 2. ACK 未返回前 live 记录保持原样，ACK 后一起提交。
{
    const h = createHarness({ saveMode: 'held', state: idleHero() });
    const pending = h.ctx.importPublicCard(meta);
    await waitFor(() => typeof h.ctx.releaseSave === 'function', 'save must be held');
    assert.equal(h.ctx.state.characters.hero.description, 'original', 'Live record must stay unchanged before ACK.');
    assert.equal(Object.keys(h.ctx.state.worldBooks).length, 0, 'No ghost world book before ACK.');
    assert.equal(h.toasts.length, 0);
    h.ctx.saveMode = 'ok';
    h.ctx.releaseSave();
    const result = await pending;
    assert.equal(result && result.name, 'Hero');
    assert.equal(h.ctx.state.characters.hero.description, 'imported description');
    assert.equal(Object.keys(h.ctx.state.worldBooks).length, 1);
    assert.equal(h.toasts.length, 1);
}

// 3. 真实 StorageService 写入失败时保留原有记录，不产生成功提示。
for (const mode of ['fail', 'refused']) {
    const h = createHarness({ saveMode: mode, state: idleHero() });
    const result = await h.ctx.importPublicCard(meta);
    assert.equal(result, null, `Import must fail when storage refuses (${mode}).`);
    assert.equal(h.ctx.state.characters.hero.description, 'original');
    assert.deepEqual(Object.keys(h.ctx.state.worldBooks), []);
    assert.equal(h.ctx.durable, undefined, 'A failed write must not report durable data.');
    assert.equal(h.toasts.length, 0, 'No success toast on storage failure.');
    assert.equal(h.alerts.length, 1);
}

// 4. 导入期间排队的后续持久化快照必须保留本次导入，且不覆盖后续修改。
{
    const h = createHarness({ saveMode: 'held', state: idleHero() });
    const pending = h.ctx.importPublicCard(meta);
    await waitFor(() => typeof h.ctx.releaseSave === 'function', 'save must be held');
    h.ctx.state.settings.model = 'later';
    const later = h.ctx.persistState(true);
    h.ctx.saveMode = 'ok';
    h.ctx.releaseSave();
    await pending;
    await later;
    assert.equal(h.ctx.durable.settings.model, 'later', 'Later queued change must be preserved.');
    assert.equal(h.ctx.durable.characters.hero.description, 'imported description', 'Queued snapshot must keep the import.');
    assert.equal(Object.keys(h.ctx.durable.worldBooks).length, 1);
}

// 5. 同名记录在 ACK 前被并发修改 / 删除 / 根对象被替换时拒绝迟到提交。
{
    // 并发修改
    const h = createHarness({ saveMode: 'held', state: idleHero() });
    const pending = h.ctx.importPublicCard(meta);
    await waitFor(() => typeof h.ctx.releaseSave === 'function', 'save must be held');
    h.ctx.state.characters.hero = { name: 'Hero', description: 'user edited during save' };
    h.ctx.saveMode = 'ok';
    h.ctx.releaseSave();
    assert.equal(await pending, null, 'A concurrent same-name edit must reject the late commit.');
    assert.equal(h.ctx.state.characters.hero.description, 'user edited during save');
    assert.deepEqual(Object.keys(h.ctx.state.worldBooks), [], 'No ghost world book after rejected commit.');
    assert.equal(h.toasts.length, 0);
    assert.equal(h.alerts.length, 1);
    assert.equal(h.ctx.durable.characters.hero.description, 'user edited during save', 'Durable store must be corrected to live state.');
    assert.deepEqual(h.ctx.durable.worldBooks, {});
}
{
    // 并发删除
    const h = createHarness({ saveMode: 'held', state: idleHero() });
    const pending = h.ctx.importPublicCard(meta);
    await waitFor(() => typeof h.ctx.releaseSave === 'function', 'save must be held');
    delete h.ctx.state.characters.hero;
    h.ctx.saveMode = 'ok';
    h.ctx.releaseSave();
    assert.equal(await pending, null, 'A concurrent delete must reject the late commit.');
    assert.equal('hero' in h.ctx.state.characters, false);
    assert.deepEqual(Object.keys(h.ctx.state.worldBooks), []);
    assert.equal(h.toasts.length, 0);
}
{
    // 根对象被恢复/清空替换
    const h = createHarness({ saveMode: 'held', state: idleHero() });
    const pending = h.ctx.importPublicCard(meta);
    await waitFor(() => typeof h.ctx.releaseSave === 'function', 'save must be held');
    h.ctx.state.characters = {};
    h.ctx.saveMode = 'ok';
    h.ctx.releaseSave();
    assert.equal(await pending, null, 'A replaced state root must reject the late commit.');
    assert.deepEqual(h.ctx.state.characters, {});
    assert.equal(h.toasts.length, 0);
}

// 6. 非法角色卡直接失败，不写入任何数据。
{
    const h = createHarness({ cardJson: { spec: 'chara_card_v2' } });
    assert.equal(await h.ctx.importPublicCard(meta), null);
    assert.deepEqual(h.writes, []);
    assert.equal(h.toasts.length, 0);
    assert.equal(h.alerts.length, 1);
}

// 7. 空世界书或畸形世界书不致命：角色照常导入，不生成世界书。
for (const book of [{ name: 'Empty', entries: [] }, { entries: { 0: null } }]) {
    const h = createHarness({ cardJson: buildCard({ data: { character_book: book } }) });
    const result = await h.ctx.importPublicCard(meta);
    assert.equal(result && result.name, 'Hero', 'Malformed embedded book must not block the character import.');
    assert.equal(h.ctx.state.characters.hero.name, 'Hero');
    assert.deepEqual(Object.keys(h.ctx.state.worldBooks), []);
    assert.equal(h.toasts.length, 1);
}

// 8. 正则同意发生在保存之前；拒绝时仍保存角色但保持正则禁用。
{
    const h = createHarness({ confirmAnswer: false, cardJson: cardWithRegex() });
    const result = await h.ctx.importPublicCard(meta);
    assert.equal(result && result.name, 'Hero');
    assert.ok(h.events.indexOf('consent') >= 0 && h.events.indexOf('consent') < h.events.indexOf('save'), 'Regex consent must precede the save.');
    assert.equal(h.ctx.state.characters.hero.regexScriptsEnabled, false, 'Refused consent must keep regex disabled.');
    assert.equal(h.ctx.state.characters.hero.regexScriptsPrompted, true);
}
{
    const h = createHarness({ confirmAnswer: true, cardJson: cardWithRegex() });
    await h.ctx.importPublicCard(meta);
    assert.equal(h.ctx.state.characters.hero.regexScriptsEnabled, true, 'Accepted consent must enable regex.');
}

// 9. __proto__ 等特殊名称通过 defineProperty 写入，不污染原型。
{
    const h = createHarness({ cardJson: buildCard({ data: { name: '__proto__' } }) });
    const result = await h.ctx.importPublicCard(Object.assign({}, meta, { name: '__proto__' }));
    assert.equal(result && result.name, '__proto__');
    assert.equal(Object.prototype.hasOwnProperty.call(h.ctx.state.characters, '__proto__'), true);
    assert.equal(Object.getPrototypeOf(h.ctx.state.characters), Object.prototype, 'Prototype must not be polluted.');
    assert.equal(h.ctx.state.characters['__proto__'].name, '__proto__');
}

console.log('R4 public card import runtime checks passed: reliable save ACK, held-ACK isolation, storage failure, queued snapshot retention, concurrent conflict rejection, malformed cards/books, regex consent ordering and __proto__ safety.');
