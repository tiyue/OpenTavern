import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ TextEncoder, console });
for (const file of ['mvu/40-mvu-data.js', 'mvu/40-mvu-parser.js', 'mvu/40-mvu-yaml-parser.js', 'mvu/40-mvu-update-blocks.js', 'mvu/40-mvu-patch-runtime.js', 'mvu/40-mvu-schema-defaults.js', 'mvu/40-mvu-template-expressions.js', 'mvu/40-mvu-template-parser.js', 'mvu/40-mvu-template.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'src', 'app', file), 'utf8'), context, { filename: file });
}
const plain = value => JSON.parse(JSON.stringify(value));
const initial = stat => context.normalizeMvuData({ stat_data: stat });
const patch = (data, operations) => context.applyMvuContent(data, '<JSONPatch>' + JSON.stringify(operations) + '</JSONPatch>');
let passed = 0;
function test(name, action) {
    action(); passed++; console.log('PASS ' + name);
}
function renders(text, data, expected, options) {
    const result = context.renderDeclarativeTemplateSubset(text, data, options);
    assert.equal(result.supported, true, JSON.stringify(result.diagnostics));
    assert.equal(result.output, expected);
    assert.deepEqual(plain(result.diagnostics), []);
}
function unsupported(text, data, options) {
    const result = context.renderDeclarativeTemplateSubset(text, data, options);
    assert.equal(result.supported, false);
    assert.equal(result.output, text);
    assert.ok(result.diagnostics.length);
}

test('JSON and YAML initialize safe nested objects, sequences and Unicode', () => {
    assert.deepEqual(plain(context.parseMvuStructuredText('{"hp":10,"text":"你好"}')), { hp: 10, text: '你好' });
    assert.deepEqual(plain(context.parseMvuStructuredText('hp: 10\nhero:\n  name: "甲#乙"\n  active: true\nbag:\n  - sword\n  - name: shield\n    count: 2\nempty: [] # comment')), { hp: 10, hero: { name: '甲#乙', active: true }, bag: ['sword', { name: 'shield', count: 2 }], empty: [] });
});
test('invalid initialization has diagnostics instead of silently skipping lines', () => {
    for (const input of ['{hp:1}', '{"hp":Infinity}', 'hp: 1\nunknown statement', 'hp: 1\n  x: 2', 'hp: &alias 1', 'hp: *alias', 'hp: !js/function x', 'hp: .nan', 'hp: |\n  multiline', '__proto__: x', 'hp: 1\nhp: 2', 'a:\n\tb: 1']) {
        const result = context.parseMvuStructuredTextWithDiagnostics(input);
        assert.equal(result.supported, false, input); assert.ok(result.diagnostics.length, input);
    }
});
test('JSON safety rejects cycles, accessors, inherited objects and nonfinite numbers', () => {
    const cyclic = {}; cyclic.self = cyclic;
    let read = 0; const accessor = {}; Object.defineProperty(accessor, 'hp', { enumerable: true, get() { read++; return 1; } });
    for (const value of [cyclic, accessor, new Date(), Object.create({ hp: 1 }), { hp: Infinity }, { hp: NaN }, { hp: undefined }, { hp: () => 1 }, { hp: [, 1] }, JSON.parse('{"constructor":1}')]) assert.equal(context.mvuValidateJsonValue(value).valid, false);
    assert.equal(read, 0);
});
test('UTF-8 and deep data limits cover initial and normalized state', () => {
    assert.equal(context.validateMvuData({ stat_data: { text: '中'.repeat(350000) } }).valid, false);
    let nested = {}; for (let i = 0; i < 34; i++) nested = { child: nested };
    assert.equal(context.mvuValidateJsonValue(nested).valid, false);
    assert.equal(context.parseMvuStructuredTextWithDiagnostics(JSON.stringify(nested)).supported, false);
    assert.equal(context.validateMvuData({ stat_data: [] }).valid, false);
});
test('normalization clones unknown JSON fields and never mutates input', () => {
    const data = { stat_data: { hp: 10 }, custom: { retained: true } };
    const normalized = context.normalizeMvuData(data); normalized.stat_data.hp = 20;
    assert.equal(data.stat_data.hp, 10); assert.equal(normalized.custom.retained, true);
    assert.deepEqual(plain(normalized.display_data), { hp: 10 });
});
test('paths consume the entire input and read only own JSON properties', () => {
    const data = { hero: { '生命': [10, '生命值'] }, bag: ['sword'] };
    assert.equal(context.getMvuPathValue(data, 'hero["生命"][0]'), 10);
    for (const invalid of ['', 'hero..hp', 'hero.', 'hero[abc]', 'hero[0]tail', '__proto__', 'hero.constructor.x', 'prototype', 'hero["__proto__"]']) assert.equal(context.getMvuPathValue(data, invalid), undefined, invalid);
    assert.equal(context.getMvuPathValue(data, 'toString'), undefined);
    assert.equal(context.parseJsonPointer('/a~2b'), null);
    assert.equal(context.parseJsonPointer(''), null);
});
test('InitVar precedes updates even when its tag appears later', () => {
    const base = initial({ hp: 1 });
    const result = context.applyMvuContent(base, '<JSONPatch>[{"op":"delta","path":"/hp","value":2}]</JSONPatch><initvar>{"hp":10}</initvar>');
    assert.equal(result.data.stat_data.hp, 12); assert.equal(base.stat_data.hp, 1);
    assert.equal(result.data.display_data.hp, '10->12');
});
test('set old values are display metadata and description tuples survive', () => {
    const result = context.applyMvuContent(initial({ hp: [10, '生命'] }), "<UpdateVariable>_.set('hp', 99, 12); //恢复</UpdateVariable>");
    assert.deepEqual(plain(result.data.stat_data.hp), [12, '生命']); assert.equal(result.data.display_data.hp, '99->12(恢复)');
    assert.equal(result.commands[0].type, 'set'); assert.equal(result.diagnostics.length, 0);
});
test('mixed blocks apply all JSON Patch before set regardless of textual order', () => {
    const text = '<UpdateVariable>_.set("hp", 2, 3); [{"op":"replace","path":"/hp","value":2}]</UpdateVariable>';
    const result = context.applyMvuContent(initial({ hp: 1 }), text);
    assert.equal(result.data.stat_data.hp, 3); assert.equal(result.diagnostics.length, 0);
});
test('one invalid set or Patch atomically rejects its entire block', () => {
    const base = initial({ hp: 10 });
    for (const text of [
        '<JSONPatch>[{"op":"replace","path":"/hp","value":20},{"op":"remove","path":"/missing"}]</JSONPatch>',
        '<JSONPatch>[{"op":"replace","path":"/hp","value":20},{"op":"execute","path":"/hp"}]</JSONPatch>',
        '<UpdateVariable>[{"op":"replace","path":"/hp","value":20}]; _.set("hp",20,"wrong type");</UpdateVariable>',
        '<UpdateVariable>_.set("hp",10,12); fetch("x");</UpdateVariable>',
        '<UpdateVariable>_.set("hp",10,Number(12));</UpdateVariable>',
        '<JSONPatch>[{op:"replace",path:"/hp",value:20}]</JSONPatch>'
    ]) { const result = context.applyMvuContent(base, text); assert.deepEqual(plain(result.data), plain(base), text); assert.equal(result.commands.length, 0); assert.ok(result.diagnostics.length); }
});
test('a failed block does not undo independent successful blocks', () => {
    const result = context.applyMvuContent(initial({ hp: 1 }), '<JSONPatch>[{"op":"replace","path":"/hp","value":2}]</JSONPatch><JSONPatch>[{"op":"remove","path":"/missing"}]</JSONPatch><UpdateVariable>_.set("hp",2,3);</UpdateVariable>');
    assert.equal(result.data.stat_data.hp, 3); assert.equal(result.commands.length, 2); assert.equal(result.diagnostics.length, 1);
    assert.ok(Number.isInteger(result.diagnostics[0].blockIndex));
});
test('Patch dialect supports arrays, pointer escaping, copy, move.to and test', () => {
    const result = patch(initial({ bag: ['a', 'b'], 'a/b': { '~key': 2 } }), [
        { op: 'insert', path: '/bag/-', value: 'c' }, { op: 'copy', from: '/a~1b/~0key', path: '/copied' },
        { op: 'test', path: '/copied', value: 2 }, { op: 'move', from: '/bag/0', to: '/bag/2' },
        { op: 'remove', path: '/bag/0' }
    ]);
    assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics)); assert.deepEqual(plain(result.data.stat_data.bag), ['c', 'a']); assert.equal(result.data.stat_data.copied, 2);
});
test('delta preserves descriptions and rejects coercion, overflow, missing and unsafe paths', () => {
    const base = initial({ hp: [10, '生命'], max: Number.MAX_VALUE });
    const result = patch(base, [{ op: 'delta', path: '/hp', value: 5 }]);
    assert.deepEqual(plain(result.data.stat_data.hp), [15, '生命']); assert.equal(result.data.display_data.hp, '10->15'); assert.equal(result.commands[0].delta, 5);
    for (const operation of [{ op: 'delta', path: '/hp', value: '5' }, { op: 'delta', path: '/max', value: Number.MAX_VALUE }, { op: 'replace', path: '/hp' }, { op: 'add', path: '/__proto__/polluted', value: true }, { op: 'copy', path: '/x', from: '/constructor' }, { op: 'replace', path: '', value: {} }]) {
        const failed = patch(base, [operation]); assert.deepEqual(plain(failed.data), plain(base)); assert.ok(failed.diagnostics.length);
    }
    assert.equal({}.polluted, undefined);
});
test('envelope dialect selects one root for the whole block', () => {
    const result = patch(initial({ hp: 10 }), [{ op: 'replace', path: '/stat_data/hp', value: 20 }, { op: 'add', path: '/schema/hp', value: 'number' }]);
    assert.equal(result.data.stat_data.hp, 20); assert.equal(result.data.schema.hp, 'number'); assert.equal(result.data.display_data.hp, 20);
    const mixed = patch(initial({ hp: 10 }), [{ op: 'replace', path: '/stat_data/hp', value: 20 }, { op: 'replace', path: '/hp', value: 30 }]);
    assert.equal(mixed.data.stat_data.hp, 10); assert.ok(mixed.diagnostics.length);
});
test('replace may change JSON type while set preserves existing value type', () => {
    assert.equal(patch(initial({ hp: 10 }), [{ op: 'replace', path: '/hp', value: 'high' }]).data.stat_data.hp, 'high');
    assert.equal(context.applyMvuContent(initial({ hp: 10 }), '<UpdateVariable>_.set("hp",10,"high");</UpdateVariable>').data.stat_data.hp, 10);
});
test('operation and resulting UTF-8 limits reject the whole block', () => {
    const base = initial({ hp: 10 });
    const operations = Array.from({ length: 257 }, () => ({ op: 'replace', path: '/hp', value: 1 }));
    assert.equal(patch(base, operations).data.stat_data.hp, 10);
    const huge = patch(base, [{ op: 'add', path: '/text', value: '中'.repeat(180000) }]);
    assert.equal(huge.data.stat_data.text, undefined); assert.ok(huge.diagnostics.length);
});
test('unclosed control blocks are diagnosed and helpers preserve original text', () => {
    const result = context.applyMvuContent(initial({ hp: 10 }), 'text<JSONPatch>[{"op":"remove","path":"/hp"}]');
    assert.ok(result.diagnostics.length); assert.equal(result.data.stat_data.hp, 10);
    assert.deepEqual(plain(context.extractMvuTaggedBlocks('<initvar>{"x":1}</initvar>', 'initvar')), ['{"x":1}']);
    assert.equal(context.stripMvuControlBlocks('a<json_patch>[]</json_patch>b'), 'ab');
});
test('YAML Patch payload and nested JSONPatch wrappers are inert data', () => {
    assert.equal(context.applyMvuContent(initial({ hp: 10 }), '<JSONPatch>\n- op: delta\n  path: /hp\n  value: 2\n</JSONPatch>').data.stat_data.hp, 12);
    assert.equal(context.applyMvuContent(initial({ hp: 10 }), '<UpdateVariable><JSONPatch>[{"op":"delta","path":"/hp","value":2}]</JSONPatch></UpdateVariable>').data.stat_data.hp, 12);
});
test('empty Patch is a no-op and copied arrays keep usable display paths', () => {
    const data = initial({ bag: ['a', 'b'] });
    assert.deepEqual(plain(patch(data, []).diagnostics), []);
    const result = patch(data, [{ op: 'copy', from: '/bag', path: '/copy' }, { op: 'add', path: '/copy/-', value: 'c' }]);
    assert.equal(result.diagnostics.length, 0); assert.deepEqual(plain(result.data.stat_data.copy), ['a', 'b', 'c']);
    assert.equal(result.data.display_data.copy[2], 'c');
});
test('unclosed marker floods remain bounded and later complete blocks are independent', () => {
    const data = initial({ hp: 10 });
    const flood = context.applyMvuContent(data, '<initvar>'.repeat(10000));
    assert.equal(flood.data.stat_data.hp, 10); assert.ok(flood.diagnostics.length <= 2);
    assert.deepEqual(plain(context.extractMvuTaggedBlocks('<initvar>'.repeat(10000), 'initvar')), []);
    assert.equal(context.stripMvuControlBlocks('<initvar>'.repeat(10000)), '<initvar>'.repeat(10000));
    const result = context.applyMvuContent(data, '<initvar>broken<JSONPatch>[{"op":"replace","path":"/hp","value":12}]</JSONPatch>');
    assert.equal(result.data.stat_data.hp, 12); assert.equal(result.diagnostics.length, 1);
});
test('static Zod defaults extract literals and nesting without executing source', () => {
    const source = 'import "https://invalid.test/module"; const Schema = z.object({ hp:z.number().default(10), name:z.string().prefault("Hero"), flags:z.array(z.string()).default([]), hero:z.object({ ready:z.boolean().default(true) }) }); registerMvuSchema(Schema);';
    assert.deepEqual(plain(context.extractMvuDefaultsFromZodSchema(source)), { hp: 10, name: 'Hero', flags: [], hero: { ready: true } });
    const unsafe = context.extractMvuDefaultsFromZodSchemaWithDiagnostics('z.object({ safe:z.number().default(3), unsafe:z.number().default(fetch("x")) })');
    assert.equal(unsafe.supported, false); assert.deepEqual(plain(unsafe.value), { safe: 3 }); assert.ok(unsafe.diagnostics.length);
    assert.equal(context.extractMvuDefaultsFromZodSchema('z.object({__proto__:z.number().default(1)})'), null);
});
test('template reads paths, fallback strings, tuples and MVU macros', () => {
    const data = initial({ hp: [15, '生命'], ready: false, name: '甲' });
    renders('<%=getvar("stat_data.hp[0]")%>|<%-get_message_variable("name")%>|{{format_message_variable::ready}}|<%=getvar("missing",{defaults:"空"})%>', data, '15|甲|false|空');
    renders('{{getvar::hp}}', data, '[15,"生命"]');
    renders('<%=getvar("missing")%>', data, '');
});
test('conditions, else if, truthiness and equality follow strict comparison', () => {
    const data = initial({ hp: 15, ready: false, kind: 'friend' });
    renders('<%if(getvar("hp")>=15){%>safe<%}else{%>danger<%}%>', data, 'safe');
    renders('<%if(getvar("hp")=="15"){%>wrong<%}else if(!getvar("ready")){%>right<%}else{%>wrong<%}%>', data, 'right');
    renders('<%const kind=getvar("kind");%><%if(kind=="friend"){%>friend<%}%>', data, 'friend');
});
test('local preludes, Number reads and conditional string assignments actually render', () => {
    const data = initial({ hp: 15 });
    renders('<%_ const value=getvar("hp"); _%><%=value%>', data, '15');
    renders('<% const hp=Number(getvar("hp")) || 1; let label=""; if(hp<10) label="low"; else if(hp>=15) label="high"; else label="middle"; %><%=label%>', data, 'high');
    renders('<% const n=Number(getvar("missing")) || 7; %><%=n%>', data, '7');
});
test('fixed lodash, define, variable aliases and IIFE patterns remain declarative', () => {
    const data = initial({ hero: { hp: 15 } });
    renders('<% define("hero", getMessageVar("stat_data.hero")); %><%=_.get(hero,"hp",0)%>', data, '15');
    renders('<%=_.get(stat_data,"missing", "none")%>', data, 'none');
    renders('<% (()=>{ const data=_.cloneDeep(getGlobalVar("stat_data")); })(); %><%=data.hero.hp%>', data, '15');
});
test('worldbook queries prefer exact names and do not recursively execute templates', () => {
    const data = initial({ hp: 15 });
    const worldInfo = [{ name: 'Entry suffix', content: 'partial' }, { name: 'Entry', content: '<%=getvar("hp")%>' }];
    renders('<%-await getwi(null,"Entry")%>', data, '<%=getvar("hp")%>', { worldInfo });
    renders('<%=getwi("Entry")%>', data, '<%=getvar("hp")%>', { worldInfo: { entries: worldInfo } });
    unsupported('<%=getwi("missing")%>', data, { worldInfo });
});
test('variable HTML is escaped and inserted macro-like strings stay inert', () => {
    const data = initial({ name: '<img src=x onerror="run()">', macro: '{{getvar::hp}}', hp: 15 });
    renders('<%=getvar("name")%>', data, '&lt;img src=x onerror=&quot;run()&quot;&gt;', { escapeValues: true });
    renders('{{getvar::name}}', data, '&lt;img src=x onerror=&quot;run()&quot;&gt;', { escapeValues: true });
    renders('{{getvar::macro}}', data, '{{getvar::hp}}');
});
test('unknown expressions return complete original text without code execution', () => {
    const data = initial({ hp: 15 });
    for (const text of ['<%=fetch("x")%>', '<%for(let i=0;i<2;i++){%>x<%}%>', '<%=getvar("hp")+1%>', '<%=getvar("__proto__")%>', '<%=getwi(getvar("name"))%>', '<%const x=eval("1");%>', '<%=missing%>', '<%if(getvar("hp")){%>x', '{{getvar::hp', '<%if(getvar("hp")&&true){%>x<%}%>']) unsupported(text, data);
});
test('template input, output, AST and condition depth limits are enforced', () => {
    const data = initial({ text: 'x'.repeat(110000), ready: true });
    unsupported('x'.repeat(100001), data);
    unsupported('<%=getvar("text")%><%=getvar("text")%>', data);
    unsupported('<%=getvar("ready")%>'.repeat(257), data);
    unsupported('<%if(getvar("ready")){%>'.repeat(9) + 'x' + '<%}%>'.repeat(9), data);
});
test('rendering and parsing do not mutate data or share local state across calls', () => {
    const data = initial({ hp: 15 }), before = JSON.stringify(data);
    renders('<%const n=getvar("hp");%><%=n%>', data, '15');
    unsupported('<%=n%>', data); assert.equal(JSON.stringify(data), before);
});
test('local names ending in underscore survive whitespace before closing marker', () => {
    renders('<% const label_=getvar("hp"); %><%= label_ %>', initial({ hp: 15 }), '15');
});

console.log('MVU parser/template: ' + passed + ' contract tests passed.');
