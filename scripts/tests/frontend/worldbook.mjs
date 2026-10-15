import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendWorldInfoNormalizerHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/worldbook/41-world-info-position.js',
    '../../../src/app/worldbook/41-world-info-extension-fields.js',
    '../../../src/app/worldbook/41-world-info-normalizer.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    JSON,
    Array,
    Object,
    isNaN,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeWIEntry;\nthis.__position = normalizeWorldInfoPositionValue;`, context);

  assert(context.__position('before_example') === 2, 'World info position normalization should support before_example.');
  assert(context.__position('missing') === 1, 'World info position normalization should default to after character.');

  const entry = context.__normalize({
    uid: 'e1',
    keys: ['alpha'],
    secondary_keys: ['beta'],
    insertion_order: 7,
    enabled: false,
    position: 'outlet',
    extensions: {
      scan_depth: 5,
      outlet_name: 'Lore',
      group_override: true,
      match_character_description: true,
      match_whole_words: true,
    },
  });

  assert(entry.key[0] === 'alpha' && entry.keysecondary[0] === 'beta', 'World info normalizer should map ST keys.');
  assert(entry.order === 7 && entry.disable === true, 'World info normalizer should map insertion_order and enabled.');
  assert(entry.position === 7 && entry.extensions.position === 7, 'World info normalizer should normalize and round-trip position.');
  assert(entry.scanDepth === 5 && entry.outletName === 'Lore' && entry.groupOverride === true, 'World info normalizer should promote extension fields.');
  assert(entry.matchCharacterDescription === true && entry.matchWholeWords === true, 'World info normalizer should promote match flags.');
  assert(Array.isArray(entry.triggers) && entry.characterFilter.isExclude === false, 'World info normalizer should ensure required shape.');
}

async function assertFrontendWorldBookDefaults() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/worldbook/42-worldbook-entry-defaults.js',
    '../../../src/app/worldbook/42-worldbook.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    Date: { now: () => 4242 },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__entry = createDefaultWIEntry;\nthis.__extensions = createDefaultWIEntryExtensions;`, context);

  const entry = context.__entry(7);
  assert(entry.uid === 7 && entry.comment === 'New Entry 7', 'World book default entry should use the provided uid.');
  assert(entry.position === 1 && entry.role === 0 && entry.depth === 4, 'World book default entry should preserve core placement defaults.');
  assert(entry.extensions.position === entry.position && entry.extensions.role === entry.role, 'World book default extensions should mirror core placement defaults.');
  assert(entry.extensions.group_weight === entry.groupWeight && entry.extensions.ignore_budget === entry.ignoreBudget, 'World book default extensions should mirror advanced defaults.');

  const generated = context.__entry();
  assert(generated.uid === 4242, 'World book default entry should fall back to Date.now for uid.');
  const extensionsA = context.__extensions();
  const extensionsB = context.__extensions();
  assert(extensionsA.triggers !== extensionsB.triggers, 'World book default extensions should return fresh array values.');
}

async function assertFrontendWorldBookFormatHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/42-worldbook-import-format.js',
    '../../../src/app/worldbook/42-worldbook-st-export-format.js',
    '../../../src/app/worldbook/42-worldbook-character-book-export.js',
    '../../../src/app/worldbook/42-worldbook-export-format.js',
    '../../../src/app/worldbook/42-worldbook-format.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: {
      worldBooks: {
        wb1: {
          name: 'Alpha Book',
          entries: {
            '2': { uid: 2, id: 2, content: 'second', insertion_order: 20, position: 1, depth: 3, outletName: 'Lore' },
          },
        },
        wb2: {
          name: 'Beta Book',
          entries: {
            '1': { uid: 1, id: 1, content: 'first', order: 10, role: 1, triggers: ['go'] },
          },
        },
      },
    },
    normalizeWIEntry(entry) {
      return Object.assign({}, entry);
    },
    JSON,
    Object,
    Array,
    Date: { now: () => 999 },
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = normalizeImportedWorldInfo;\nthis.__st = entriesToSTFormat;\nthis.__book = getCharacterBookForExport;`, context);

  const importedArray = context.__import({
    name: 'Imported',
    entries: [{ id: '7', content: 'seven' }, { content: 'zero' }],
  });
  assert(importedArray.name === 'Imported' && importedArray.entries['7'].uid === 7 && importedArray.entries['1'].uid === 1, 'World book import should normalize array entries and numeric ids.');

  const importedObject = context.__import({
    worldInfo: {
      entries: {
        custom: { content: 'custom uid' },
      },
    },
  });
  assert(importedObject.entries['999'].uid === 999, 'World book import should fall back to Date.now for non-numeric object keys.');

  const st = context.__st({
    name: 'Exported',
    entries: {
      '4': {
        uid: 4,
        content: 'entry',
        position: 4,
        depth: 2,
        role: 1,
        outletName: 'Outlet',
        matchWholeWords: true,
      },
    },
  });
  assert(st.name === 'Exported' && st.entries['4'].extensions.position === 4 && st.entries['4'].extensions.outlet_name === 'Outlet', 'World book ST export should mirror extension fields.');
  assert(Array.isArray(st.entries['4'].extensions.triggers), 'World book ST export should always include triggers.');

  const book = context.__book({ worldBookIds: ['wb1', 'wb2'] });
  assert(book.name === 'Alpha Book + Beta Book', 'Character book export should combine world book names.');
  assert(book.entries.map((entry) => entry.content).join(',') === 'first,second', 'Character book export should sort merged entries by order.');
  assert(book.entries[1].extensions.depth === 3, 'Character book export should keep ST extension mappings.');
}

async function assertFrontendWorldBookActivation() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/worldbook/41-world-info-position.js',
    '../../../src/app/worldbook/41-world-info-extension-fields.js',
    '../../../src/app/worldbook/41-world-info-normalizer.js',
    '../../../src/app/worldbook/44-worldbook-match-keys.js',
    '../../../src/app/worldbook/44-worldbook-match-filters.js',
    '../../../src/app/worldbook/44-worldbook-scan-text.js',
    '../../../src/app/worldbook/44-worldbook-matching.js',
    '../../../src/app/worldbook/44-worldbook-budget.js',
    '../../../src/app/worldbook/44-worldbook-timed-effects.js',
    '../../../src/app/worldbook/44-worldbook-activation-helpers.js',
    '../../../src/app/worldbook/44-worldbook-activation-collection.js',
    '../../../src/app/worldbook/44-worldbook-activation-cache.js',
    '../../../src/app/worldbook/44-worldbook-activation-groups.js',
    '../../../src/app/worldbook/44-worldbook-activation-selection.js',
    '../../../src/app/worldbook/44-worldbook-activation-result.js',
    '../../../src/app/worldbook/44-worldbook-activation.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {
        userName: 'Sensei',
        worldInfoBudgetEnabled: false,
      },
      worldBooks: {
        wb1: {
          id: 'wb1',
          entries: {
            global: {
              uid: 'global',
              key: ['Kivotos'],
              content: 'Global lore mentions recursive-key.',
              order: 20,
              position: 1,
            },
            recursive: {
              uid: 'recursive',
              key: ['recursive-key'],
              content: 'Recursive lore',
              order: 30,
              position: 1,
            },
            disabled: {
              uid: 'disabled',
              key: ['Kivotos'],
              content: 'Disabled lore',
              disable: true,
              order: 40,
            },
          },
        },
      },
    },
    getActiveConv: () => activeConv,
    getEffectivePostHistoryInstructions: () => '',
    console,
    JSON,
    Date,
    Math,
    Object,
    Array,
    String,
    RegExp,
    parseInt,
    isNaN,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__activate = getActivatedWorldInfo;\nthis.__WI_POS = WI_POS;`, context);

  activeConv = {
    id: 'c-worldbook',
    messages: [
      { role: 'user', content: 'We reached Kivotos today.' },
      { role: 'assistant', content: 'Welcome, Sensei.' },
    ],
    character: { name: 'Arona', tags: ['blue'] },
    worldBookIds: ['wb1'],
    worldInfo: {
      entries: {
        legacy: {
          uid: 'legacy',
          constant: true,
          content: 'Legacy lore',
          order: 10,
          position: 0,
        },
      },
    },
  };

  const first = context.__activate(activeConv);
  const ids = first.entries.map((entry) => entry.uid);
  assert(ids.join(',') === 'legacy,global,recursive', 'World book activation order or recursion changed.');
  assert(first.byPosition[context.__WI_POS.BEFORE_CHAR][0].uid === 'legacy', 'Legacy world info was not grouped before character.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'global'), 'Global world book entry did not activate.');
  assert(first.byPosition[context.__WI_POS.AFTER_CHAR].some((entry) => entry.uid === 'recursive'), 'Recursive world book entry did not activate.');
  assert(!first.entries.some((entry) => entry.uid === 'disabled'), 'Disabled world book entry activated.');
  assert(activeConv._wiCache && activeConv._wiCache.result === first, 'World book activation result was not cached.');

  const second = context.__activate(activeConv);
  assert(second === first, 'World book activation cache was not reused for the same conversation fingerprint.');
}

async function assertFrontendWorldBookActivationHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/44-worldbook-activation-collection.js',
    '../../../src/app/worldbook/44-worldbook-activation-cache.js',
    '../../../src/app/worldbook/44-worldbook-activation-groups.js',
    '../../../src/app/worldbook/44-worldbook-activation-selection.js',
    '../../../src/app/worldbook/44-worldbook-activation-result.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let activeConv = null;
  const context = {
    state: {
      settings: {},
      worldBooks: {
        wb1: {
          entries: {
            global: { uid: 'global', key: ['Kivotos'], content: 'Global lore' },
          },
        },
      },
    },
    normalizeWIEntry(entry) { return Object.assign({}, entry); },
    passesCharacterFilter: () => true,
    passesProbability: () => true,
    buildScanText: () => 'Kivotos trigger',
    entryMatchesKeys: (entry) => (entry.key || []).includes('Kivotos'),
    entryMatchesSecondary: () => true,
    applyWorldInfoBudget(entries) { return { entries, trimmed: entries.length > 2 }; },
    getActiveConv() { return activeConv; },
    WI_POS: { AFTER_CHAR: 1, OUTLET: 6 },
    JSON,
    Date,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__collect = collectWorldInfoActivationEntries;\nthis.__combined = buildCombinedWorldInfo;\nthis.__enabled = getEnabledWorldInfoEntries;\nthis.__key = buildWorldInfoActivationCacheKey;\nthis.__cache = cacheActivatedWorldInfoResult;\nthis.__direct = activateDirectWorldInfoEntries;\nthis.__recursive = expandRecursiveWorldInfoEntries;\nthis.__dedupe = dedupeWorldInfoEntries;\nthis.__winner = chooseWorldInfoGroupWinner;\nthis.__groups = resolveWorldInfoInclusionGroups;\nthis.__budget = applyWorldInfoBudgetWithWarning;\nthis.__grouped = groupActivatedWorldInfoByPosition;`, context);

  const conv = {
    worldBookIds: ['wb1'],
    worldInfo: { entries: { local: { uid: 'local', constant: true, content: 'Local lore' } } },
    messages: [
      { role: 'user', content: 'Kivotos first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'last message' },
    ],
  };
  const entries = context.__collect(conv);
  assert(entries.length === 2, 'World book activation collection should include linked and legacy entries.');
  assert(entries.find((entry) => entry.uid === 'global')._sourceWorldBookId === 'wb1', 'Linked world book entries should keep source world book id.');

  const combined = context.__combined(entries.concat([{ uid: 'disabled', disable: true }]));
  assert(Object.keys(combined.entries).length === 3, 'Combined world info should index entries by uid.');
  assert(context.__enabled(combined).map((entry) => entry.uid).join(',') === 'global,local', 'Enabled world info helper should filter disabled entries.');

  const keyA = context.__key(conv, combined);
  const keyB = context.__key(Object.assign({}, conv, { messages: conv.messages.concat({ role: 'assistant', content: 'new tail' }) }), combined);
  assert(keyA !== keyB, 'World info activation cache key should change when message fingerprint changes.');
  const result = { entries: [] };
  context.__cache(conv, keyA, result);
  assert(conv._wiCache.key === keyA && conv._wiCache.result === result, 'World info activation cache should store key and result.');

  const direct = context.__direct([
    { uid: 'hit', key: ['Kivotos'], content: 'hit' },
    { uid: 'constant', constant: true, content: 'constant' },
    { uid: 'miss', key: ['Other'], content: 'miss' },
  ], conv, 'Arona', []);
  assert(direct.map((entry) => entry.uid).join(',') === 'hit,constant', 'Direct world info activation should include key hits and constants.');

  const recursive = context.__recursive([{ uid: 'base', content: 'mentions recursive-key' }], [
    { uid: 'base', content: 'mentions recursive-key' },
    { uid: 'recursive', key: ['recursive-key'], content: 'recursive' },
  ], 'Arona', []);
  assert(recursive.some((entry) => entry.uid === 'recursive' && entry.isRecursive === true), 'Recursive world info activation should mark recursive entries.');

  assert(context.__dedupe([{ uid: 'a' }, { uid: 'a' }, { uid: 'b' }]).map((entry) => entry.uid).join(',') === 'a,b', 'World info dedupe should keep first uid occurrence.');
  const winner = context.__winner([
    { uid: 'low', group: 'g', key: ['a'], useGroupScoring: true },
    { uid: 'high', group: 'g', key: ['a', 'b'], keysecondary: ['c'], selectiveLogic: 0, useGroupScoring: true },
  ]);
  assert(winner.uid === 'high', 'World info group scoring should select highest score.');
  const resolved = context.__groups([{ uid: 'solo' }, { uid: 'low', group: 'g', order: 1 }, { uid: 'high', group: 'g', order: 5 }]);
  assert(resolved.map((entry) => entry.uid).sort().join(',') === 'high,solo', 'World info inclusion groups should keep one winner per group.');

  activeConv = {};
  const budgeted = context.__budget([{ uid: '1' }, { uid: '2' }, { uid: '3' }]);
  assert(budgeted.length === 3 && activeConv._wiBudgetWarning === true, 'World info budget helper should set warning on trimmed result.');

  const grouped = context.__grouped([
    { uid: 'normal', position: 1 },
    { uid: 'late', position: 6, outletName: 'Lore', order: 20 },
    { uid: 'early', position: 6, outletName: 'Lore', order: 5 },
  ]);
  assert(grouped.byPosition[1][0].uid === 'normal', 'World info grouping should preserve normal positions.');
  assert(grouped.outlets.Lore.map((entry) => entry.uid).join(',') === 'early,late', 'World info outlets should sort by order.');
}

async function assertFrontendWorldBookMatchingHelpers() {
  const sources = await Promise.all([
    '../../../src/app/prompt/41-prompt-controls.js',
    '../../../src/app/presets/62-sillytavern-preset-model.js',
    '../../../src/app/worldbook/44-worldbook-match-keys.js',
    '../../../src/app/worldbook/44-worldbook-match-filters.js',
    '../../../src/app/worldbook/44-worldbook-scan-text.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const context = {
    state: { settings: { userName: 'Sensei' } },
    getEffectivePostHistoryInstructions: () => 'depth note',
    Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    RegExp,
    String,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = entryMatchesKeys;\nthis.__secondary = entryMatchesSecondary;\nthis.__charFilter = passesCharacterFilter;\nthis.__prob = passesProbability;\nthis.__scan = buildScanText;`, context);

  assert(context.__key({ key: ['Kivotos'] }, 'hello kivotos', false, false), 'World book key matching should be case-insensitive by default.');
  assert(context.__key({ key: ['/Ki.vo/i'] }, 'Kiavo', true, false), 'World book key matching should support regex keys.');
  assert(context.__secondary({ keysecondary: ['a', 'b'], selectiveLogic: 1 }, 'a b', false), 'World book secondary matching should support AND logic.');
  assert(!context.__secondary({ keysecondary: ['a'], selectiveLogic: 2 }, 'a', false), 'World book secondary matching should support NOT logic.');
  assert(context.__charFilter({ characterFilter: { isExclude: false, names: ['Arona'], tags: [] } }, 'arona', []), 'Character filter should match names case-insensitively.');
  assert(!context.__charFilter({ characterFilter: { isExclude: true, names: [], tags: ['ai'] } }, 'Plana', ['AI']), 'Character filter should exclude matching tags.');
  assert(context.__prob({ useProbability: true, probability: 30 }) === true, 'Probability filter should use percent chance.');
  assert(context.__prob({ useProbability: true, probability: 20 }) === false, 'Probability filter should fail when roll is above chance.');

  const scan = context.__scan({
    character: { name: 'Arona', description: 'desc', personality: 'kind', scenario: 'scene', creator_notes: 'notes', extensions: { depth_prompt: { prompt: 'depth note' } } },
    messages: [
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  }, 4, { matchCharacterDescription: true, matchCharacterDepthPrompt: true });
  assert(scan.includes('Sensei: hi') && scan.includes('Arona: hello'), 'Scan text should include labeled recent messages.');
  assert(scan.includes('CharacterDescription: desc') && scan.includes("Character's Note: depth note"), 'Scan text should include selected character sources.');
  assert(!scan.includes('hidden'), 'Scan text should exclude system messages.');
}

async function assertFrontendWorldBookEntryListFiltering() {
  const source = await readFile(new URL('../../../src/app/worldbook/43-worldbook-entry-list-filter.js', import.meta.url), 'utf8');
  const context = {
    dom: { wiSearch: { value: '  kivotos  ' } },
    normalizeWIEntry: (entry) => entry,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getCurrentWorldBookFilter;\nthis.__entries = getFilteredWorldInfoEntries;`, context);

  const wi = {
    entries: {
      low: { uid: 'low', key: ['academy'], keysecondary: [], comment: 'Kivotos note', order: 10 },
      high: { uid: 'high', key: ['Kivotos'], keysecondary: [], comment: '', order: 50 },
      secondary: { uid: 'secondary', key: [], keysecondary: ['Kivotos'], comment: '', order: 30 },
      other: { uid: 'other', key: ['Gehenna'], keysecondary: [], comment: '', order: 100 },
    },
  };

  assert(context.__filter() === 'kivotos', 'World book filter did not trim search text.');
  const filtered = context.__entries(wi, context.__filter());
  assert(filtered.map((entry) => entry.uid).join(',') === 'high,secondary,low', 'World book entries were not filtered and sorted by order.');
}

async function assertFrontendWorldBookEntryActionHelpers() {
  const source = await readFile(new URL('../../../src/app/worldbook/43-worldbook-entry-action-helpers.js', import.meta.url), 'utf8');
  const events = [];
  const context = {
    dom: { wiSearch: { value: '  lore  ' } },
    wiState: {
      currentWorldBookId: 'wb1',
      viewMode: 'entries',
      selectedUid: 'e1',
      dirty: false,
    },
    state: {
      conversations: {
        c1: { worldBookIds: ['wb1', 'wb2'] },
        c2: { worldBookIds: ['wb1'] },
        c3: {},
      },
    },
    updateWIDirtyIndicator() { events.push('dirty'); },
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    persistState(force) { events.push(`persist:${force}`); },
    updateStorageInfo() { events.push('storage'); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    JSON,
    Object,
    Array,
  };

  vm.runInNewContext(`${source}\nthis.__filter = getWIEntryActionFilter;\nthis.__mark = markWIEntryActionDirtyAndRender;\nthis.__copy = createDuplicateWIEntry;\nthis.__unlink = unlinkWorldBookFromConversations;\nthis.__reset = resetWorldBookSelectionAfterDelete;\nthis.__refresh = refreshWorldBookDeleteViews;`, context);

  assert(context.__filter() === 'lore', 'World book entry action helper should trim the search filter.');
  context.__mark();
  assert(context.wiState.dirty === true && events.includes('dirty') && events.includes('entries:lore'), 'World book entry action helper should mark dirty and render with the current filter.');

  const sourceEntry = { uid: 'old', comment: '', key: ['Kivotos'], nested: { value: 1 } };
  const copy = context.__copy(sourceEntry, 123);
  sourceEntry.nested.value = 2;
  assert(copy.uid === 123 && copy.comment === 'Entry (copy)' && copy.nested.value === 1, 'World book entry action helper should deep-copy duplicated entries.');

  context.__unlink('wb1');
  assert(context.state.conversations.c1.worldBookIds.join(',') === 'wb2' && context.state.conversations.c2.worldBookIds.length === 0, 'World book delete helper should unlink deleted books from conversations.');

  context.__reset('wb1');
  assert(context.wiState.currentWorldBookId === null && context.wiState.viewMode === 'books' && context.wiState.selectedUid === null, 'World book delete helper should reset selection for the deleted active book.');

  events.length = 0;
  context.__refresh();
  assert(events.join('|') === 'dirty|persist:true|storage|badge|books:lore|header', 'World book delete helper should refresh persistence, badge, list, and header views.');
}

async function assertFrontendWorldBookEntryListUIHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/43-worldbook-entry-list-navigation-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-list-association-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-list-delete-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-list-header-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-list-row-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function fakeElement() {
    const toggle = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const del = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    const button = { listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.wi-list-toggle') return toggle;
        if (selector === '.wi-list-del') return del;
        if (selector === 'button') return button;
        return null;
      },
      _button: button,
    };
  }

  const emptyContainer = fakeElement();
  const events = [];
  const activeConv = { worldBookIds: ['wb1'] };
  const context = {
    dom: { wiEntryStats: { textContent: '' } },
    wiState: { selectedUid: 'e1', currentWorldBookId: 'wb1', viewMode: 'entries', dirty: false },
    document: { createElement: fakeElement },
    t: (key) => key,
    escapeHtml: (value) => String(value),
    getCurrentWorldBookFilter() { return 'filter'; },
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    getActiveConv() { return activeConv; },
    updateWIDirtyIndicator() { events.push('dirty'); },
    persistState(force) { events.push(`persist:${force}`); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    deleteWorldBook(id) { events.push(`delete:${id}`); },
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__header = appendWorldBookEntryListHeader;\nthis.__empty = renderWorldBookEntryListEmpty;\nthis.__row = createWorldBookEntryListRow;`, context);

  const headerContainer = fakeElement();
  context.__header(headerContainer);
  assert(headerContainer.children.length === 3, 'World book entry list header should append navigation, association, and delete rows.');
  headerContainer.children[0].listeners.click();
  assert(context.wiState.viewMode === 'books' && context.wiState.currentWorldBookId === null && events.includes('header'), 'World book header back row should return to the book list.');
  context.wiState.currentWorldBookId = 'wb1';
  headerContainer.children[1]._button.listeners.click();
  assert(activeConv.worldBookIds.length === 0 && events.includes('dirty') && events.includes('books:filter'), 'World book association row should unlink the active book and refresh views.');
  headerContainer.children[2]._button.listeners.click();
  assert(events.includes('delete:wb1'), 'World book delete row should delete the active book.');

  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 world_book_entry', 'World book entry empty state should update list stats.');

  context.wiState.selectedUid = 'e1';
  const row = context.__row({ uid: 'e1', comment: 'Memo', key: ['Kivotos'], order: 7 }, { entries: { e1: {} } });
  assert(row.className.includes('bg-amber-500/10'), 'World book entry list row should mark the selected entry active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book entry delete button should render a valid close control.');
  assert(!row.innerHTML.includes('閴'), 'World book entry list row should not render mojibake button text.');
}

async function assertFrontendWorldBookEntryLiveHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/43-worldbook-entry-live-core.js',
    '../../../src/app/worldbook/43-worldbook-entry-live-match.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const entry = { uid: 'e1', extensions: {} };
  const context = {
    wiState: { selectedUid: 'e1' },
    getActiveWI() { return { entries: { e1: entry } }; },
    Object,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__entry = getSelectedWorldBookEntry;\nthis.__setPath = setWorldBookEntryPathValue;\nthis.__syncExt = syncWorldBookEntryExtensionField;\nthis.__matchExtKey = getWorldBookMatchExtensionKey;`, context);

  assert(context.__entry() === entry, 'World book live binding should resolve the selected entry.');
  context.__setPath(entry, 'characterFilter.isExclude', true);
  assert(entry.characterFilter.isExclude === true, 'World book live binding should write nested checkbox paths.');
  context.__syncExt(entry, 'position', 6);
  context.__syncExt(entry, 'role', 1);
  context.__syncExt(entry, 'comment', 'ignored');
  assert(entry.extensions.position === 6 && entry.extensions.role === 1 && entry.extensions.comment === undefined, 'World book live binding should sync supported extension fields only.');
  assert(context.__matchExtKey('matchCharacterDescription') === 'match_character_description', 'World book match extension keys should use snake_case.');
}

async function assertFrontendWorldBookEntryEditorHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/41-world-info-constants.js',
    '../../../src/app/worldbook/43-worldbook-entry-editor-strategy-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-editor-position-ui.js',
    '../../../src/app/worldbook/43-worldbook-entry-editor-state.js',
    '../../../src/app/worldbook/43-worldbook-entry-editor-header-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function button() {
    return {
      attrs: {},
      style: {},
      setAttribute(name, value) { this.attrs[name] = value; },
    };
  }

  const entry = { characterFilter: {} };
  const titleEl = { textContent: '' };
  const context = {
    dom: {
      wiStratConstant: button(),
      wiStratSelective: button(),
      wiDepthRow: { classList: classList() },
      wiOutletRow: { classList: classList() },
      wiNoSelection: { classList: classList() },
      wiEditorForm: { classList: classList() },
      wiCharNames: { value: ' Arona, Plana ' },
      wiCharTags: { value: ' ai, helper ' },
    },
    wiState: {
      selectedUid: 'e1',
      primaryKeys: ['old'],
      secondaryKeys: ['old2'],
      currentWorldBookId: 'wb1',
      dirty: false,
    },
    state: { worldBooks: { wb1: { name: 'Lore' } } },
    getActiveWI() { return { entries: { e1: entry } }; },
    document: { querySelector: () => titleEl },
    Set,
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__strategy = updateStrategyButtons;\nthis.__position = updatePositionConditionalRows;\nthis.__none = showNoSelection;\nthis.__update = updateEntryFromForm;\nthis.__header = updateWorldBookModalHeader;`, context);

  context.__strategy({ constant: true });
  assert(context.dom.wiStratConstant.attrs['data-active'] === 'true', 'World book strategy UI should mark constant active.');
  assert(context.dom.wiStratSelective.style.borderColor === '', 'World book strategy UI should clear inactive border.');

  context.__position(context.WI_POS.AT_DEPTH);
  assert(!context.dom.wiDepthRow.classList.values.has('hidden') && context.dom.wiOutletRow.classList.values.has('hidden'), 'World book position UI should show depth row only for AT_DEPTH.');

  context.__update();
  assert(entry.characterFilter.names.join(',') === 'Arona,Plana', 'World book editor should sync character filter names.');
  assert(entry.characterFilter.tags.join(',') === 'ai,helper' && context.wiState.dirty === true, 'World book editor should sync character filter tags and mark dirty.');

  context.__header();
  assert(titleEl.textContent === '世界书：Lore', 'World book editor header should show selected world book name.');

  context.__none();
  assert(context.wiState.selectedUid === null && context.wiState.primaryKeys.length === 0, 'World book no-selection state should clear selection and keys.');
}

async function assertFrontendWorldBookImportExportUIHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/43-worldbook-export-ui.js',
    '../../../src/app/worldbook/43-worldbook-badge-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const badgeEl = { textContent: '', title: '' };
  const context = {
    dom: { wiEntryCount: badgeEl },
    state: {
      worldBooks: {
        wb1: { entries: { a: {}, b: {} } },
        wb2: { entries: { c: {} } },
      },
    },
    getActiveConv() {
      return { worldBookIds: ['wb1', 'wb2'], worldInfo: { entries: { legacy: {} } } };
    },
    t: (key) => key,
    String,
    Object,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__name = sanitizeWorldInfoFileName;\nthis.__badge = renderWorldInfoBadge;\nthis.__suffix = buildWorldInfoBadgeSourceSuffix;`, context);

  assert(context.__name('Lore: A/B?') === 'Lore_A_B', 'World book export filename should replace unsafe characters.');
  assert(context.__name('') === 'world_info', 'World book export filename should keep a non-empty fallback.');

  context.__badge();
  assert(badgeEl.textContent === 4, 'World book badge should count linked and legacy entries.');
  assert(badgeEl.title.includes('\u6765\u81ea 2 \u4e2a\u4e16\u754c\u4e66'), 'World book badge title should describe multiple linked books.');
}

async function assertFrontendWorldBookGlobalListUIHelpers() {
  const sources = await Promise.all([
    '../../../src/app/worldbook/43-worldbook-global-list-filter.js',
    '../../../src/app/worldbook/43-worldbook-global-list-actions.js',
    '../../../src/app/worldbook/43-worldbook-global-list-row-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function fakeButton() {
    return { addEventListener() {} };
  }
  function fakeElement() {
    return {
      className: '',
      innerHTML: '',
      textContent: '',
      children: [],
      addEventListener() {},
      appendChild(child) { this.children.push(child); },
      querySelector(selector) {
        if (selector === '.world-book-del-btn' || selector === '.world-book-unlink-btn') return fakeButton();
        return null;
      },
    };
  }

  const events = [];
  const currentConv = { worldBookIds: ['one', 'two'] };
  const context = {
    state: { worldBooks: {
      one: { id: 'one', name: 'Kivotos', entries: { a: {} } },
      two: { id: 'two', name: 'Gehenna', entries: {} },
    } },
    dom: { wiEntryStats: { textContent: '' }, wiBookName: { value: '' }, wiSearch: { value: '  lore  ' } },
    wiState: { currentWorldBookId: 'one', viewMode: 'books', selectedUid: 'old', dirty: false },
    document: { createElement: fakeElement },
    t: (key) => ({ world_book_entry: 'entry', world_book_linked: 'Linked', world_book_unlink: 'Unlink', world_book_delete_book: 'Delete', world_book_no_books_hint: 'No books' }[key] || key),
    escapeHtml: (value) => String(value),
    getActiveConv: () => currentConv,
    renderWIEntryList(filter) { events.push(`entries:${filter}`); },
    updateWorldBookModalHeader() { events.push('header'); },
    updateWIDirtyIndicator() { events.push('dirty'); },
    persistState(force) { events.push(`persist:${force}`); },
    renderWorldInfoBadge() { events.push('badge'); },
    renderWorldBookList(filter) { events.push(`books:${filter}`); },
    getCurrentWorldBookFilter: () => 'kiv',
    Object,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__filter = getFilteredWorldBookList;\nthis.__empty = renderWorldBookListEmpty;\nthis.__row = createWorldBookListRow;\nthis.__open = openWorldBookFromList;\nthis.__unlink = unlinkWorldBookFromCurrentConversation;`, context);

  assert(context.__filter('kiv').map((book) => book.id).join(',') === 'one', 'World book global list should filter by book name.');

  const emptyContainer = fakeElement();
  context.__empty(emptyContainer);
  assert(emptyContainer.children.length === 1 && context.dom.wiEntryStats.textContent === '0 entry', 'World book global list empty state should update stats.');

  const row = context.__row({ id: 'one', name: '', entries: { a: {} } }, ['one']);
  assert(row.className.includes('bg-amber-500/10'), 'World book global list row should mark the selected book active.');
  assert(row.innerHTML.includes('&times;</button>'), 'World book global delete button should render a valid close control.');
  assert(row.innerHTML.includes('Linked') && !row.innerHTML.includes('鏈'), 'World book global list row should render translated linked text without mojibake.');

  context.__open({ id: 'two', name: 'Gehenna' });
  assert(context.wiState.currentWorldBookId === 'two' && context.wiState.viewMode === 'entries' && context.wiState.selectedUid === null, 'World book global list open action should select the book and switch to entry mode.');
  assert(context.dom.wiBookName.value === 'Gehenna' && events.includes('entries:lore') && events.includes('header'), 'World book global list open action should refresh the editor view.');

  events.length = 0;
  context.__unlink('one');
  assert(currentConv.worldBookIds.join(',') === 'two' && context.wiState.dirty === true, 'World book global list unlink action should remove the book from the active conversation and mark dirty.');
  assert(events.join('|') === 'dirty|persist:true|badge|books:kiv', 'World book global list unlink action should refresh persistence, badge, and list state.');
}
export { assertFrontendWorldInfoNormalizerHelpers, assertFrontendWorldBookDefaults, assertFrontendWorldBookFormatHelpers, assertFrontendWorldBookActivation, assertFrontendWorldBookActivationHelpers, assertFrontendWorldBookMatchingHelpers, assertFrontendWorldBookEntryListFiltering, assertFrontendWorldBookEntryActionHelpers, assertFrontendWorldBookEntryListUIHelpers, assertFrontendWorldBookEntryLiveHelpers, assertFrontendWorldBookEntryEditorHelpers, assertFrontendWorldBookImportExportUIHelpers, assertFrontendWorldBookGlobalListUIHelpers };
