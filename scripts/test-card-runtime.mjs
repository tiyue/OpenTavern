import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (name) => fs.readFileSync(path.join(projectRoot, 'src', 'app', name), 'utf8');

const context = {
    console,
    state: {
        settings: {
            userName: 'Sensei',
            userDescription: 'Patient teacher',
            sillyTavernPreset: {
                prompts: [
                    { identifier: 'main', content: 'Main prompt' },
                    { identifier: 'jailbreak', content: 'Instruction prompt' }
                ],
                regexScripts: [],
                regexScriptsEnabled: false
            }
        }
    },
    showGlassConfirm: async () => true,
    t: (key) => key
};
vm.createContext(context);
vm.runInContext([
    readSource('prompt/40-sillytavern-macro-runtime.js'),
    readSource('prompt/40-character-prompt-helpers.js'),
    readSource('prompt/40-character-regex-runtime.js'),
    `globalThis.runtime = {
        createEnv: createSillyTavernMacroEnv,
        evaluate: evaluateSillyTavernMacros,
        persistEnv: persistSillyTavernMacroEnv,
        activateEnv: activateSillyTavernMacroEnv,
        restoreEnv: restoreSillyTavernMacroEnv,
        replace: replacePlaceholders,
        applyRegex: applyRegexScripts,
        format: formatMessage,
        pattern: buildRegexScriptPattern,
        consent: requestCharacterRegexConsent,
        consentPreset: requestSillyTavernPresetRegexConsent,
        hasRegex: characterHasRegexScripts
    };`
].join('\n'), context);

const conv = {
    id: 'chat-1',
    stLocalVars: { score: 2 },
    messages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'last question' }
    ]
};
const env = context.runtime.createEnv(conv, { charName: 'Arona' });
assert.equal(context.runtime.evaluate('{{char}}/{{user}}/{{persona}}', env), 'Arona/Sensei/Patient teacher');
assert.equal(context.runtime.evaluate('{{lastusermessage}}|{{lastcharmessage}}|{{lastmessage}}', env), 'last question|first answer|last question');
assert.equal(context.runtime.evaluate('{{setvar::name::{{char}}}}{{getvar::name}}', env), 'Arona', 'Nested macros should resolve inside-out.');
assert.equal(context.runtime.evaluate('{{addvar::score::3}}{{getvar::score}}', env), '5', 'addvar should add numeric values.');
assert.equal(context.runtime.evaluate('{{incvar::score}}/{{decvar::score}}', env), '6/5', 'incvar and decvar should return updated values.');
assert.equal(context.runtime.evaluate('{{charPrompt}}|{{charInstruction}}', env), 'Main prompt|Instruction prompt');
assert.equal(context.runtime.evaluate('{{newline::3}}').length, 3, 'newline should support a bounded count.');
assert.equal(context.runtime.evaluate('{{future_macro::x}}', env), '{{future_macro::x}}', 'Unknown macros must be preserved.');

const pickA = context.runtime.createEnv({ id: 'same-chat' }, { charName: 'A' });
const pickB = context.runtime.createEnv({ id: 'same-chat' }, { charName: 'A' });
assert.equal(
    context.runtime.evaluate('{{pick::one::two::three}}', pickA),
    context.runtime.evaluate('{{pick::one::two::three}}', pickB),
    'pick should be deterministic for the same conversation and call order.'
);
context.runtime.persistEnv(env);
assert.equal(conv.stLocalVars.name, 'Arona');
assert.equal(conv.stLocalVars.score, 5);

const activeEnv = context.runtime.createEnv(conv, { charName: 'Arona' });
const previous = context.runtime.activateEnv(activeEnv, true);
assert.equal(context.runtime.replace('{{setvar::mood::happy}}{{getvar::mood}}', 'Arona', 'Sensei'), 'happy');
context.runtime.restoreEnv(previous);
assert.equal(activeEnv.vars.mood, 'happy', 'Active prompt macro environment should accept mutations.');

const character = {
    name: 'Arona',
    regexScriptsEnabled: true,
    regexScriptsPromptEnabled: true,
    extensions: {
        regex_scripts: [
            {
                placement: ['USER_INPUT'],
                findRegex: '/hello (\\w+)/i',
                replaceString: 'Hi $1 from {{char}}'
            },
            {
                placement: [2],
                findRegex: 'secret',
                replaceString: 'shown',
                markdownOnly: true
            },
            {
                placement: ['AI_OUTPUT'],
                findRegex: 'secret',
                replaceString: 'prompted',
                promptOnly: true,
                minDepth: 1,
                maxDepth: 2
            },
            {
                placement: ['AI_OUTPUT'],
                findRegex: '/\\[(.*?)\\]/g',
                replaceString: '{{$1}}',
                trimStrings: ['{', '}']
            }
        ]
    }
};

assert.equal(
    context.runtime.applyRegex('hello world', character, { processingPhase: 'display', sourcePlacement: 'USER_INPUT' }),
    'Hi world from Arona'
);
assert.equal(
    context.runtime.applyRegex('secret', character, { processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }),
    'shown'
);
assert.equal(
    context.runtime.applyRegex('secret', character, { processingPhase: 'prompt', sourcePlacement: 'AI_OUTPUT', depth: 0 }),
    'secret',
    'Prompt-only replacements should honor minDepth.'
);
assert.equal(
    context.runtime.applyRegex('secret', character, { processingPhase: 'prompt', sourcePlacement: 'AI_OUTPUT', depth: 1 }),
    'prompted'
);
assert.equal(
    context.runtime.applyRegex('[value]', character, { processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }),
    'value',
    'trimStrings should remove configured strings from replacements.'
);
assert.equal(
    context.runtime.format('visible<UpdateVariable>{"x":1}</UpdateVariable>', { character, processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }),
    'visible',
    'MVU control blocks must not leak into displayed text.'
);
assert.equal(context.runtime.pattern('x'.repeat(10001)), null, 'Oversized regex patterns must be rejected.');

const gatedCharacter = {
    name: 'Gated',
    extensions: { regex_scripts: [{ placement: [2], findRegex: 'x', replaceString: 'y' }] }
};
assert.equal(context.runtime.hasRegex(gatedCharacter), true);
assert.equal(context.runtime.applyRegex('x', gatedCharacter, { processingPhase: 'display', sourcePlacement: 'AI_OUTPUT' }), 'x', 'Regex must default to disabled.');
await context.runtime.consent(gatedCharacter);
assert.equal(gatedCharacter.regexScriptsPrompted, true);
assert.equal(gatedCharacter.regexScriptsEnabled, true);
assert.equal(gatedCharacter.regexScriptsPromptEnabled, true);

context.state.settings.sillyTavernPreset.regexScripts = [
    { placement: ['USER_INPUT'], findRegex: 'preset', replaceString: 'enabled' }
];
context.state.settings.sillyTavernPreset.regexScriptsEnabled = false;
context.state.settings.sillyTavernPreset.regexScriptsPrompted = false;
assert.equal(
    context.runtime.applyRegex('preset', null, { processingPhase: 'prompt', sourcePlacement: 'USER_INPUT' }),
    'preset',
    'Preset regex must default to disabled.'
);
await context.runtime.consentPreset(context.state.settings.sillyTavernPreset);
assert.equal(context.state.settings.sillyTavernPreset.regexScriptsPrompted, true);
assert.equal(context.state.settings.sillyTavernPreset.regexScriptsEnabled, true);
assert.equal(
    context.runtime.applyRegex('preset', null, { processingPhase: 'prompt', sourcePlacement: 'USER_INPUT' }),
    'enabled',
    'Accepted preset regex should participate in prompt formatting.'
);

console.log('Card runtime checks passed: macros, local variables, regex phases, depth bounds and character/preset consent gating.');

// 正则执行队列与显示链的确定性回归（独立入口，导入现有 npm check 入口执行）。
await import('./test-regex-queue-runtime.mjs');
