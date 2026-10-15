import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendCharacterImportHelpers() {
  const sources = await Promise.all([
    '../../../src/app/character/40-character-card-import.js',
    '../../../src/app/character/40-character-book-import.js',
    '../../../src/app/prompt/40-character-prompt-helpers.js',
    '../../../src/app/character/65-character-export.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  let createdBookName = null;
  const context = {
    state: {
      settings: {
        postHistoryInstructions: ' custom first ',
        twoStagePostHistoryInstructions: '',
      },
    },
    t: (key) => key,
    normalizeImportedWorldInfo(book) {
      return {
        name: book.normalizedName,
        entries: {
          e1: { uid: 'e1', content: 'Kivotos' },
        },
      };
    },
    createNewWorldBook(name) {
      createdBookName = name;
      return { id: 'wb1', name, entries: {} };
    },
    console: { log() {} },
    JSON,
    Object,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = importCharacterCard;\nthis.__book = importCharacterBookFromCard;\nthis.__replace = replacePlaceholders;\nthis.__post = getEffectivePostHistoryInstructions;\nthis.__exportPayload = buildCharacterCardExportPayload;`, context);

  const imported = context.__import({
    spec: 'chara_card_v2',
    data: {
      name: 'Arona',
      description: 123,
      first_mes: 'Hello {{user}}',
      tags: ['ai'],
      nickname: 'A.R.O.N.A',
      creator_notes_multilingual: { 'zh-CN': '备注' },
      creator: 'Author',
      character_version: '3.1',
      source: ['https://example.test/card'],
      alternate_greetings: ['Alt'],
      group_only_greetings: ['Group'],
      assets: [{ type: 'icon', uri: 'embeded://avatar' }],
      extensions: { source: 'test', regex_scripts: [{ findRegex: 'x', replaceString: 'y' }] },
    },
  });
  assert(imported.name === 'Arona' && imported.description === '123', 'Character import should normalize v2 card fields to strings.');
  assert(imported.tags[0] === 'ai' && imported.extensions.source === 'test', 'Character import should preserve tags and extensions.');
  assert(imported.creator === 'Author' && imported.character_version === '3.1', 'Character import should preserve creator metadata.');
  assert(imported.group_only_greetings[0] === 'Group' && imported.assets[0].type === 'icon', 'Character import should preserve v3 greetings and assets.');
  const exported = context.__exportPayload(imported, { name: 'Embedded Lore', entries: [] });
  assert(exported.data.creator === 'Author' && exported.data.character_version === '3.1', 'Character export should preserve creator metadata.');
  assert(exported.data.extensions.regex_scripts.length === 1 && exported.data.group_only_greetings[0] === 'Group', 'Character export should preserve extensions and v3 greetings.');
  assert(exported.data.character_book.name === 'Embedded Lore' && exported.data.extensions.world === 'Embedded Lore', 'Character export should embed the current world book.');

  const book = context.__book({
    data: {
      character_book: {
        name: 'Embedded Lore',
        normalizedName: 'Normalized Lore',
        entries: [],
      },
    },
  }, 'Arona');
  assert(book && book.id === 'wb1' && book.name === 'Normalized Lore', 'Character book import should create and name a world book.');
  assert(createdBookName === 'Embedded Lore', 'Character book import should use embedded book name when creating the book.');

  assert(context.__replace('Hi {{char}} from {{user}}', 'Arona', 'Sensei') === 'Hi Arona from Sensei', 'Placeholder replacement changed.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'first') === 'custom first', 'First-stage post-history override should win.');
  assert(context.__post({ post_history_instructions: 'card post' }, 'second') === 'card post', 'Second-stage post-history should fall back to character card when unset.');
}

async function assertFrontendCharacterPanelUI() {
  const sources = await Promise.all([
    '../../../src/app/character/65-character-panel-helpers.js',
    '../../../src/app/character/65-character-panel-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function element() {
    return { classList: classList(), textContent: '', innerHTML: '', className: '' };
  }

  let activeConv = null;
  let badgeRenders = 0;
  const dom = {
    charCardPreview: element(),
    charCardEmptyHint: element(),
    charEditBtn: element(),
    charExportBtn: element(),
    charRemoveBtn: element(),
    charCardAvatar: element(),
    charCardName: element(),
    charCardTagCount: element(),
  };
  const context = {
    dom,
    getActiveConv() { return activeConv; },
    isGroupChat(conv) { return !!(conv && conv.group); },
    getGroupMembers(conv) { return conv.group.members; },
    renderWorldInfoBadge() { badgeRenders += 1; },
    t: (key) => ({ char_empty_name: 'Unnamed' }[key] || key),
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__render = renderCharacterCard;\nthis.__summary = buildGroupCharacterSummary;`, context);

  context.__render();
  assert(dom.charCardPreview.classList.values.has('hidden') && !dom.charCardEmptyHint.classList.values.has('hidden'), 'Character panel should show the empty state without an active conversation.');
  assert(dom.charEditBtn.classList.values.has('hidden') && badgeRenders === 1, 'Character panel empty state should hide actions and refresh the world info badge.');

  activeConv = {
    group: {
      name: 'Team',
      members: [
        { character: { name: 'Arona' } },
        { character: { name: 'Plana' } },
        { character: { name: 'Mika' } },
      ],
    },
  };
  context.__render();
  assert(dom.charCardName.textContent === 'Team' && dom.charCardAvatar.textContent === 'Group', 'Character panel should render group chat identity.');
  assert(dom.charCardTagCount.textContent.includes('3 角色') && dom.charCardTagCount.textContent.includes('等'), 'Character panel should summarize group members.');
  assert(context.__summary(activeConv.group.members).includes('Arona、Plana'), 'Character panel summary helper should include the first two group members.');

  activeConv = { character: { name: 'Arona', previewImage: 'avatar.png', tags: ['ai', 'guide'] } };
  context.__render();
  assert(dom.charEditBtn.classList.values.has('hidden') === false && dom.charCardAvatar.innerHTML.includes('avatar.png'), 'Character panel should show actions and image avatars for single-character chats.');
  assert(dom.charCardName.textContent === 'Arona' && dom.charCardTagCount.textContent === '2 tags', 'Character panel should render single-character metadata.');
}
export { assertFrontendCharacterImportHelpers, assertFrontendCharacterPanelUI };
