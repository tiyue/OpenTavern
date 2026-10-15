import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendSillyTavernPresetNormalizer() {
  const sources = await Promise.all([
    '../../../src/app/presets/62-sillytavern-preset-model.js',
    '../../../src/app/presets/62-sillytavern-preset-order-items.js',
    '../../../src/app/presets/62-sillytavern-preset-order-normalizer.js',
    '../../../src/app/presets/62-sillytavern-preset-prompt-normalizer.js',
    '../../../src/app/presets/62-sillytavern-preset-normalizer.js',
    '../../../src/app/presets/62-sillytavern-preset-placement.js',
    '../../../src/app/presets/62-sillytavern-preset-runtime.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: {} },
    DEFAULT_TWO_STAGE_PROMPT: 'two stage default',
    defaultSettings: () => ({}),
    t: (key) => key,
    replacePlaceholders: (text, charName, userName) => text.replaceAll('{{char}}', charName).replaceAll('{{user}}', userName),
    Date,
    Object,
    String,
    Array,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeSillyTavernPreset;\nthis.__ensure = ensureSillyTavernPresetSettings;\nthis.__buildBuckets = buildSillyTavernPresetMessageBuckets;\nthis.__orderItems = getSillyTavernPromptOrderItems;\nthis.__orderMap = buildSillyTavernOrderMap;\nthis.__serializeOrder = serializeSillyTavernPromptOrderItems;\nthis.__role = normalizePromptRole;\nthis.__placement = getSillyTavernPresetPlacement;\nthis.__depth = parseSillyTavernDepth;\nthis.__describePlacement = describeSillyTavernPresetPlacement;\nthis.__historyMarker = isSillyTavernChatHistoryMarker;`, context);

  assert(context.__role('0') === 'system', 'SillyTavern numeric system role was not normalized.');
  assert(context.__role('1') === 'user', 'SillyTavern numeric user role was not normalized.');
  assert(context.__role('2') === 'assistant', 'SillyTavern numeric assistant role was not normalized.');
  assert(context.__placement({ position: 'after chat' }) === 'after_history', 'SillyTavern placement helper should detect after-history prompts.');
  assert(context.__placement({ injection_depth: 3 }) === 'in_chat', 'SillyTavern placement helper should infer in-chat prompts from depth.');
  assert(context.__depth({ injection_depth: '3' }) === 3, 'SillyTavern depth helper should parse injection_depth.');
  assert(context.__describePlacement({ position: 'in_chat', depth: 2 }) === 'in-chat d2', 'SillyTavern placement description should include in-chat depth.');
  assert(context.__historyMarker('conversation-history') === true, 'SillyTavern history marker helper should normalize marker names.');
  const objectOrderItems = context.__orderItems({
    order: ['main'],
    disabled_prompt: false,
    depth_prompt: { identifier: 'depth_prompt', enabled: true, order: 4, injection_depth: 2 },
  });
  assert(objectOrderItems.length === 3 && objectOrderItems[1].identifier === 'disabled_prompt' && objectOrderItems[1].enabled === false, 'SillyTavern order object helpers should preserve boolean prompt toggles.');
  const orderMap = context.__orderMap(objectOrderItems);
  assert(orderMap.DEPTH_PROMPT == null && orderMap.depth_prompt.depth === 2, 'SillyTavern order map should preserve exact and lowercase prompt IDs.');
  const serializedOrder = context.__serializeOrder([{ identifier: 'main', enabled: false, role: 123, order: 1 }, { identifier: '' }]);
  assert(serializedOrder.length === 1 && serializedOrder[0].role === '123' && serializedOrder[0].enabled === false, 'SillyTavern order serializer should filter empty IDs and stringify roles.');

  const preset = context.__normalize({
    name: 'Imported ST Preset',
    prompts: [
      { identifier: 'main', name: 'Main', role: '0', content: 'Hello {{char}}' },
      { identifier: 'after', role: 'system', content: 'After {{user}}' },
      { identifier: 'depth', role: 'assistant', content: 'Depth note', injection_depth: 2 },
    ],
    extensions: {
      regex_scripts: [{ placement: [2], findRegex: 'before', replaceString: 'after' }],
    },
    prompt_order: [{
      order: [
        { identifier: 'main', enabled: true, order: 2, position: 'before_history' },
        { identifier: 'chat_history', enabled: true, order: 3 },
        { identifier: 'after', enabled: true, order: 4, position: 'after_history' },
        { identifier: 'depth', enabled: true, order: 5, position: 'in_chat', depth: 2 },
      ],
    }],
  });

  assert(preset.name === 'Imported ST Preset', 'SillyTavern preset name was not preserved.');
  assert(preset.prompts.length === 3, 'SillyTavern preset prompts were not preserved.');
  assert(preset.prompts[0].role === 'system', 'SillyTavern preset prompt role was not normalized.');
  assert(preset.promptOrder.length === 4, 'SillyTavern prompt order was not preserved.');
  assert(preset.regexScripts.length === 1, 'SillyTavern preset regex_scripts were not preserved.');
  assert(preset.regexScriptsEnabled === false, 'Imported preset regex_scripts must default to disabled.');

  context.state.settings.sillyTavernPreset = preset;
  context.__ensure();
  const buckets = context.__buildBuckets('Arona', 'Sensei');
  assert(buckets.beforeHistory[0].content === 'Hello Arona', 'Before-history preset prompt did not render with placeholders.');
  assert(buckets.afterHistory[0].content === 'After Sensei', 'After-history preset prompt was not bucketed correctly.');
  assert(buckets.inChat[0]._depth === 2, 'In-chat preset prompt depth was not preserved.');

  const legacy = context.__normalize({ main_prompt: 'legacy main prompt' });
  assert(legacy.prompts[0].identifier === 'main_prompt', 'Legacy SillyTavern prompt fields were not imported.');
  const regexOnly = context.__normalize({ data: { name: 'Regex only', extensions: { regex_scripts: [{ findRegex: 'x', replaceString: 'y' }] } } });
  assert(regexOnly.prompts.length === 0 && regexOnly.regexScripts.length === 1, 'Regex-only SillyTavern presets should import without placeholder prompts.');
}

async function assertFrontendSillyTavernPresetSettingsRows() {
  const sources = await Promise.all([
    '../../../src/app/presets/62-sillytavern-preset-placement.js',
    '../../../src/app/presets/62-sillytavern-preset-settings-rows.js',
    '../../../src/app/presets/62-sillytavern-preset-settings-empty-ui.js',
    '../../../src/app/presets/62-sillytavern-preset-settings-toggle-ui.js',
    '../../../src/app/presets/62-sillytavern-preset-settings-list-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const context = {
    escapeHtml: (value) => String(value),
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__rows = getSillyTavernPresetRows;\nthis.__rowHtml = buildSillyTavernPresetRowHtml;`, context);
  const rows = context.__rows({
    prompts: [
      { id: 'late', order: 20 },
      { id: 'early', order: 1 },
      { id: 'middle', order: 10 },
    ],
  });

  assert(rows.map((row) => row.prompt.id).join(',') === 'early,middle,late', 'SillyTavern preset settings rows should sort by prompt order.');
  assert(rows.map((row) => row.index).join(',') === '1,2,0', 'SillyTavern preset settings rows should preserve original prompt indexes.');
  const rowHtml = context.__rowHtml({ prompt: { id: 'depth', role: 'system', content: 'Depth content', position: 'in_chat', depth: 4 }, index: 0 });
  assert(rowHtml.includes('in-chat d4'), 'SillyTavern preset row should render placement descriptions from the placement helper.');
}
export { assertFrontendSillyTavernPresetNormalizer, assertFrontendSillyTavernPresetSettingsRows };
