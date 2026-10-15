import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendPublicCardAssets() {
  const dataSource = await readFile(new URL('../../../src/app/library/60-public-card-data.js', import.meta.url), 'utf8');
  const assetSource = await readFile(new URL('../../../src/app/library/60-public-card-assets.js', import.meta.url), 'utf8');
  const librarySource = await readFile(new URL('../../../src/app/library/60-public-card-library.js', import.meta.url), 'utf8');

  const context = {
    window: { location: { protocol: 'file:' } },
    JSON,
  };
  vm.runInNewContext(`${dataSource}\n${assetSource}\n${librarySource}\nthis.__cards = getPublicCards();\nthis.__resolve = resolvePublicCardAssetUrl;\nthis.__resolveImage = resolvePublicCardImageUrl;\nthis.__resolveJson = resolvePublicCardJsonUrl;`, context);

  assert(Array.isArray(context.__cards), 'Public card library did not expose an array.');
  assert(context.__cards.length >= 10, 'Public card library should contain bundled cards.');
  assert(context.__resolve('/cards/Plana.png') === 'cards/Plana.png', 'File protocol should use relative card asset paths.');
  assert(context.__resolve('\\\\cards\\\\Plana.png') === 'cards/Plana.png', 'File protocol should normalize Windows-style card asset paths.');
  assert(context.__resolveImage({ previewImage: '/cards/Plana.png' }) === 'cards/Plana.png', 'Public card image helper should resolve preview assets.');
  assert(context.__resolveJson({ jsonUrl: '/cards/Plana.json' }) === 'cards/Plana.json', 'Public card JSON helper should resolve card data assets.');

  context.window.location.protocol = 'http:';
  assert(context.__resolve('/cards/Plana.png') === '/cards/Plana.png', 'HTTP protocol should preserve absolute card asset paths.');

  const assetPaths = [];
  context.__cards.forEach((card) => {
    assert(card.jsonUrl, `Public card ${card.id || card.name} is missing a JSON URL.`);
    if (card.previewImage) assetPaths.push(context.__resolve(card.previewImage));
    assetPaths.push(context.__resolve(card.jsonUrl));
  });

  for (const assetPath of assetPaths) {
    const bytes = await readFile(new URL(`../../../${assetPath.replace(/^\/+/, '')}`, import.meta.url));
    assert(bytes.byteLength > 0, `Public card asset is empty: ${assetPath}`);
  }
}

async function assertFrontendLibraryCardFilterHelpers() {
  const source = await readFile(new URL('../../../src/app/library/60-library-card-filter.js', import.meta.url), 'utf8');
  const context = {
    librarySearchQuery: '',
    activeLibraryTab: 'my',
    PUBLIC_CARD_DISPLAY_AUTHOR: 'Hajimides',
    Array,
    String,
    RegExp,
  };

  vm.runInNewContext(`${source}\nthis.__passes = passesLibraryFilter;`, context);

  context.librarySearchQuery = 'sensei';
  assert(context.__passes({ name: 'Alpha', author: 'Sensei', tags: [], description: '' }), 'Library card filter should match authors.');
  context.librarySearchQuery = 'kind';
  assert(context.__passes({ name: 'Alpha', tags: [], personality: 'Kind guide' }), 'Library card filter should match descriptions or personalities.');
  context.librarySearchQuery = 'missing';
  assert(!context.__passes({ name: 'Alpha', tags: ['hero'], description: 'guide' }), 'Library card filter should reject non-matching searches.');

  context.librarySearchQuery = '圣三一';
  assert(context.__passes({ academyZh: '圣三一' }), 'Library card filter should match academy names.');
  context.activeLibraryTab = 'public';
  context.librarySearchQuery = 'hajimides';
  assert(context.__passes({ author: 'Original metadata' }), 'Official public cards should match their catalog display author.');
}

async function assertFrontendLibraryCardDisplayHelpers() {
  const source = await readFile(new URL('../../../src/app/library/60-library-card-display-helpers.js', import.meta.url), 'utf8');
  function makeElement(tag) {
    return {
      tag,
      className: '',
      textContent: '',
      children: [],
      appendChild(child) { this.children.push(child); },
    };
  }
  const context = {
    document: { createElement: makeElement },
  };

  vm.runInNewContext(`${source}\nthis.__name = getLibraryCardDisplayName;\nthis.__initial = getLibraryCardInitial;\nthis.__tags = formatLibraryCardTags;\nthis.__info = createLibraryCardInfo;`, context);

  assert(context.__name({ name: '' }) === 'Unnamed', 'Library card display helper should default missing names.');
  assert(context.__initial({ name: 'arona' }) === 'A' && context.__initial({}) === '?', 'Library card display helper should derive initials.');
  assert(context.__tags(['a', 'b', 'c', 'd']) === 'a · b · c', 'Library card display helper should show the first three tags.');
  const info = context.__info({ name: 'Alpha', tags: ['one', 'two'] });
  assert(info.children.length === 2 && info.children[0].textContent === 'Alpha' && info.children[1].textContent === 'one · two', 'Library card display helper should build shared card info nodes.');
}

async function assertFrontendMyCardGridFiltering() {
  const source = await readFile(new URL('../../../src/app/library/60-library-my-card-filter.js', import.meta.url), 'utf8');
  const context = {
    state: {
      characters: {
        keep: { name: 'Keep', tags: ['ai'], description: '', personality: 'kind', creator_notes: 'note' },
        skip: { name: 'Skip', tags: ['other'], description: 'other', creator: 'creator' },
      },
    },
    passesLibraryFilter: (card) => card.name === 'Keep' && card.description === 'kind' && card.author === 'note',
    Object,
  };

  vm.runInNewContext(`${source}\nthis.__card = buildMyLibraryCharacterFilterCard;\nthis.__filtered = getFilteredMyLibraryCharacters;`, context);

  const filterCard = context.__card(context.state.characters.keep);
  assert(filterCard.description === 'kind' && filterCard.author === 'note', 'My card grid filter helper should map personality and creator notes into filter fields.');
  const filtered = context.__filtered();
  assert(filtered.length === 1 && filtered[0].name === 'Keep', 'My card grid filtering should use the shared library filter.');
}

async function assertFrontendMyCardControlHelpers() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-my-card-control-helpers.js',
    '../../../src/app/library/60-library-my-card-controls-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  let confirmResult = false;
  const context = {
    showGlassConfirm: async (message, options) => {
      events.push(`confirm:${message}:${options.okText}`);
      return confirmResult;
    },
    deleteCharacterFromLibrary: (key) => events.push(`delete:${key}`),
    renderMyCards: () => events.push('render'),
    document: {
      createElement(tagName) {
        return {
          tagName,
          handlers: {},
          addEventListener(type, handler) {
            this.handlers[type] = handler;
          },
        };
      },
    },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__key = getMyCharacterCardKey;\nthis.__config = getMyCharacterDeleteConfirmConfig;\nthis.__button = createMyCharacterControlButton;\nthis.__confirm = confirmAndDeleteMyCharacterCard;`, context);

  assert(context.__key({ name: ' Arona ' }) === 'arona', 'My card controls should normalize character keys.');
  const config = context.__config({ name: 'Arona' });
  assert(config.message.includes('Arona') && config.options.danger === true, 'My card controls should build a dangerous delete confirmation.');

  let stopped = false;
  const button = context.__button({
    className: 'test-control',
    html: '<span>icon</span>',
    title: 'test title',
    onClick() {
      events.push('button-click');
    },
  });
  button.handlers.click({ stopPropagation() { stopped = true; } });
  assert(button.className === 'test-control' && button.innerHTML.includes('icon') && button.title === 'test title', 'My card control helper should create configured buttons.');
  assert(stopped === true && events.includes('button-click'), 'My card control helper should stop propagation before running button actions.');

  await context.__confirm({ name: 'Arona' });
  assert(!events.includes('delete:arona'), 'My card controls should not delete when confirmation is cancelled.');

  confirmResult = true;
  await context.__confirm({ name: 'Arona' });
  assert(events.includes('delete:arona') && events.includes('render'), 'My card controls should delete and refresh after confirmation.');
}

async function assertFrontendMyCardImageUploadHelpers() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-card-image-upload-input-helpers.js',
    '../../../src/app/library/60-library-card-image-upload-helpers.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const events = [];
  const avatars = {
    charAvatar: { innerHTML: '', className: '' },
    charCardAvatar: { innerHTML: '', className: '' },
  };
  const bodyChildren = [];
  class FileReaderMock {
    readAsDataURL(file) {
      events.push(`read:${file.name}`);
      this.onload({ target: { result: 'data:image/png;base64,reader' } });
    }
  }
  const context = {
    state: { characters: { arona: { name: 'Arona' } } },
    currentCharacterName: ' Arona ',
    persistState(flag) { events.push(`persist:${flag}`); },
    renderMyCards() { events.push('render'); },
    document: {
      body: {
        appendChild(input) {
          input.parentNode = this;
          bodyChildren.push(input);
        },
        removeChild(input) {
          const index = bodyChildren.indexOf(input);
          if (index >= 0) bodyChildren.splice(index, 1);
          input.parentNode = null;
        },
      },
      createElement(tag) {
        return { tagName: tag.toUpperCase(), style: {}, files: [] };
      },
      getElementById(id) {
        return avatars[id] || null;
      },
    },
    FileReader: FileReaderMock,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__createInput = createCardImageUploadInput;\nthis.__removeInput = removeCardImageUploadInput;\nthis.__getFile = getCardImageUploadFile;\nthis.__readFile = readCardImageUploadFile;\nthis.__key = getCardImageUploadKey;\nthis.__active = isActiveCharacterCardKey;\nthis.__html = buildCardImageUploadAvatarHtml;\nthis.__save = saveMyCharacterPreviewImage;`, context);

  const input = context.__createInput();
  const file = { name: 'avatar.png' };
  input.files = [file];
  assert(input.type === 'file' && input.accept === 'image/*' && input.style.display === 'none' && bodyChildren.includes(input), 'My card image upload input helpers should create hidden image file inputs.');
  assert(context.__getFile(input) === file, 'My card image upload input helpers should return the selected file.');
  context.__readFile(file, (dataUrl) => events.push(`loaded:${dataUrl}`), () => events.push('read-error'));
  assert(events.includes('read:avatar.png') && events.includes('loaded:data:image/png;base64,reader'), 'My card image upload input helpers should read selected files as data URLs.');
  context.__removeInput(input);
  assert(bodyChildren.length === 0 && input.parentNode === null, 'My card image upload input helpers should remove temporary inputs.');
  events.length = 0;

  assert(context.__key({ name: ' Arona ' }) === 'arona', 'My card image upload should normalize character keys.');
  assert(context.__active('arona') === true, 'My card image upload should detect the active character key.');
  assert(context.__html({ name: 'A "Quoted"' }, 'data-url', 'rounded-xl').includes('alt="A &quot;Quoted&quot;"'), 'My card image upload should escape avatar alt quotes.');

  assert(context.__save({ name: 'Arona' }, 'data:image/png;base64,abc') === true, 'My card image upload should save preview images for known cards.');
  assert(context.state.characters.arona.previewImage === 'data:image/png;base64,abc', 'My card image upload should store previewImage on the character card.');
  assert(events.join('|') === 'persist:true|render', 'My card image upload should persist and refresh the card grid after saving.');
  assert(avatars.charAvatar.innerHTML.includes('data:image/png;base64,abc') && avatars.charAvatar.className.includes('rounded-xl'), 'My card image upload should refresh the active chat avatar.');
  assert(avatars.charCardAvatar.innerHTML.includes('rounded-lg') && avatars.charCardAvatar.className.includes('rounded-lg'), 'My card image upload should refresh the active card avatar.');

  const eventCount = events.length;
  assert(context.__save({ name: 'Missing' }, 'data:image/png;base64,missing') === false, 'My card image upload should ignore missing cards.');
  assert(events.length === eventCount, 'My card image upload should not persist when no card was updated.');
}

async function assertFrontendMyCardActionHelpers() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-my-card-action-helpers.js',
    '../../../src/app/library/60-library-my-card-actions-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set(['hidden']);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function makeElement() {
    return {
      className: '',
      innerHTML: '',
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children = this.children || []; this.children.push(child); },
    };
  }

  const events = [];
  const grid = { children: [], appendChild(child) { this.children.push(child); } };
  const context = {
    dom: {
      importModal: { classList: classList() },
      importStatus: { classList: classList() },
      importFileInput: { value: 'old' },
    },
    document: { createElement: makeElement },
    openCharacterEditor: () => events.push('editor'),
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__configs = getMyCardActionTileConfigs;\nthis.__append = appendMyCardActionTiles;\nthis.__open = openMyCardImportModal;`, context);

  const configs = context.__configs();
  assert(configs.length === 2 && configs[0].title === '新建角色' && configs[1].title === '导入角色卡', 'My card actions should expose create and import tile configs.');
  configs[0].onClick();
  assert(events.includes('editor'), 'My card create tile should open the character editor.');

  context.__append(grid);
  assert(grid.children.length === 2 && grid.children[0].innerHTML.includes('新建角色'), 'My card actions should append both action tiles.');
  context.__open();
  assert(!context.dom.importModal.classList.values.has('hidden') && context.dom.importStatus.classList.values.has('hidden') && context.dom.importFileInput.value === '', 'My card import modal should open and reset stale controls.');
}

async function assertFrontendPublicCardGridFiltering() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-public-card-filter.js',
    '../../../src/app/library/60-library-public-card-grid-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const cards = [
    { name: 'Alpha', tags: ['keep'] },
    { name: 'Beta', tags: ['skip'] },
  ];
  const context = {
    getPublicCardsForActiveSeries: () => cards.filter((card) => card.tags.includes('keep')),
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__filtered = getFilteredPublicLibraryCards;`, context);
  const filtered = context.__filtered();
  assert(filtered.length === 1 && filtered[0].name === 'Alpha', 'Public card grid filtering did not use the library filter.');
}

async function assertFrontendPublicCardListUI() {
  const sources = await Promise.all([
    '../../../src/app/library/60-public-card-text-ui.js',
    '../../../src/app/chat/61-message-text-format.js',
    '../../../src/app/library/60-public-card-list-filter.js',
    '../../../src/app/library/60-public-card-list-item-ui.js',
    '../../../src/app/library/60-public-card-list-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      contains(name) { return values.has(name); },
    };
  }

  function makeElement(tag) {
    const element = {
      tag,
      children: [],
      className: '',
      _innerHTML: '',
      textContent: '',
      classList: classList(),
      listeners: {},
      appendChild(child) { this.children.push(child); },
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
    Object.defineProperty(element, 'innerHTML', {
      get() { return this._innerHTML; },
      set(value) {
        this._innerHTML = String(value);
        if (value === '') this.children = [];
      },
    });
    return element;
  }

  const cards = [
    { id: 'a', name: 'Alpha', author: 'Sensei', description: 'Blue archive card', tags: ['blue', 'hero'], previewImage: 'assets/a.png' },
    { id: 'b', name: 'Beta', author: 'Other', description: 'Red card', tags: ['red'], previewImage: 'assets/b.png' },
  ];
  const detailEvents = [];
  const container = makeElement('div');
  const empty = makeElement('div');
  const count = makeElement('span');
  const context = {
    dom: {
      cardLibraryListView: container,
      cardLibraryEmpty: empty,
      cardLibraryResultCount: count,
      cardLibrarySearchContainer: makeElement('div'),
      cardLibraryDetailView: makeElement('div'),
    },
    document: { createElement: makeElement },
    getPublicCards: () => cards,
    resolvePublicCardImageUrl: (card) => 'resolved:' + card.previewImage,
    showCardLibraryDetail: (card) => detailEvents.push(card.id),
    switchView: () => {},
    setActiveTab: () => {},
    currentLibraryCard: { id: 'old' },
    String,
    RegExp,
    Set,
    Array,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__normalize = normalizeCardLibraryQuery;\nthis.__matches = cardMatchesLibraryQuery;\nthis.__filter = filterCardLibraryCards;\nthis.__item = createCardLibraryItem;\nthis.__fallback = createCardLibraryImageFallback;\nthis.__list = filterCardLibraryList;\nthis.__show = showCardLibraryListView;`, context);

  assert(context.__normalize('  BLUE ') === 'blue', 'Public card list query should be normalized.');
  const highlightedSearch = context.highlightMatch(`<b title="x">&'`, 'b');
  assert(highlightedSearch.includes('&lt;') && highlightedSearch.includes('&gt;') && highlightedSearch.includes('&quot;') && highlightedSearch.includes('&amp;') && highlightedSearch.includes('&#39;') && highlightedSearch.includes('bg-amber-500/30'), 'Library search highlighting must use the shared complete HTML escaping contract.');
  assert(context.__matches(cards[0], 'sensei') && context.__matches(cards[0], 'archive') && context.__matches(cards[0], 'hero'), 'Public card list matching should include author, description, and tags.');
  assert(context.__filter(cards, 'red')[0].id === 'b', 'Public card list filter should return matching cards.');

  const item = context.__item(cards[0], 'alp');
  assert(item.children.length === 2, 'Public card list item should render image and content columns.');
  assert(item.children[0].children[0].src === 'resolved:assets/a.png', 'Public card list item should resolve preview images.');
  assert(item.children[1].children[0].innerHTML.includes('bg-amber-500/30'), 'Public card list item should highlight query matches.');
  item.listeners.click();
  assert(detailEvents[0] === 'a', 'Public card list item click should open details.');
  assert(context.__fallback({ name: '<alpha>' }).includes('&lt;'), 'Public card image fallback should escape the initial.');

  context.__list('blue');
  assert(container.children.length === 1 && container.children[0].children[1].children[0].innerHTML.includes('Alpha'), 'Public card list filter should render matching cards.');
  assert(empty.classList.values.has('hidden') && count.textContent.includes('1'), 'Public card list filter should hide empty state and update count.');

  context.__list('missing');
  assert(container.children.length === 0 && !empty.classList.values.has('hidden'), 'Public card list filter should show empty state for no matches.');

  context.__show();
  assert(context.currentLibraryCard === null, 'Public card list view should reset the selected card.');
}

async function assertFrontendPublicCardImportFlow() {
  const sources = await Promise.all([
    '../../../src/app/library/60-public-card-import-helpers.js',
    '../../../src/app/library/60-public-card-import-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const modal = { classList: { add(name) { events.push(`modal:${name}`); } } };
  const pickerModal = { classList: { contains(name) { return name === 'hidden' ? false : false; } } };
  const body = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      events.push(`toast:${child.textContent}`);
    },
  };
  const context = {
    dom: { cardLibraryModal: modal },
    state: { characters: {}, worldBooks: {} },
    currentView: 'library',
    async fetch(url) {
      events.push(`fetch:${url}`);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: { name: 'Alpha' } };
        },
      };
    },
    resolvePublicCardJsonUrl(card) { return `json:${card.id}`; },
    resolvePublicCardImageUrl(card) { return `image:${card.previewImage}`; },
    importCharacterCard() { return { name: 'Alpha' }; },
    getEmbeddedCharacterBook() { events.push('book:Alpha'); return { name: 'Alpha Book', entries: { one: { content: 'World' } } }; },
    normalizeImportedWorldInfo(book) { return book; },
    getImportedCharacterBookName(book) { return book.name; },
    async persistState(immediate, options) {
      events.push('persist');
      assert(immediate && options.throwOnError, 'Import requires an acknowledged local save.');
      const candidate = options.transformSnapshot({ characters: {}, worldBooks: {} });
      assert(candidate.characters.alpha && !context.state.characters.alpha, 'Only the candidate may contain the import before ACK.');
      await Promise.resolve();
      options.beforePersist();
      options.onPersistSuccess();
      events.push('ack');
    },
    requestFullRender() { events.push('render-full'); },
    renderLibraryGrids() { events.push('render-library'); },
    showNewChatCharacterPicker() { events.push('picker-refresh'); },
    t(key) { return key === 'card_library_import_success' ? 'Imported' : ''; },
    document: {
      body,
      createElement(tag) {
        return {
          tag,
          className: '',
          textContent: '',
          style: {},
          remove() { events.push('toast-remove'); },
        };
      },
      getElementById(id) {
        if (id === 'newChatPickerList') return {};
        if (id === 'newChatPickerModal') return pickerModal;
        return null;
      },
    },
    setTimeout(callback) { callback(); },
    window: {},
    console: { warn() {}, error() {} },
    alert(message) { events.push(`alert:${message}`); },
    JSON,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__import = importPublicCard;`, context);

  await context.__import({ id: 'alpha', previewImage: 'alpha.png', author: 'Tester' });

  const imported = context.state.characters.alpha;
  assert(imported && imported.previewImage === 'image:alpha.png' && imported.author === 'Tester', 'Public card import should preserve public metadata on the imported character.');
  assert(events.includes('fetch:json:alpha') && events.includes('book:Alpha'), 'Public card import should fetch card data and import embedded world books.');
  assert(Object.values(context.state.worldBooks).some(book => book.entries.one.content === 'World'), 'Embedded world books commit with the character after ACK.');
  assert(events.indexOf('ack') < events.indexOf('toast:Imported'), 'Success feedback must follow the local ACK.');
  assert(events.includes('persist') && events.includes('render-full') && events.includes('modal:hidden'), 'Public card import should persist, rerender, and close the library modal.');
  assert(events.includes('toast:Imported') && events.includes('render-library') && events.includes('picker-refresh'), 'Public card import should show success feedback and refresh visible card pickers.');
  assert(!events.some((event) => event.startsWith('alert:')), 'Public card import should not alert on a successful import.');
}

async function assertFrontendLibraryPublicCardDetailModal() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-public-card-detail-content-helpers.js',
    '../../../src/app/library/60-library-public-card-detail-modal-helpers.js',
    '../../../src/app/library/60-library-public-card-detail-modal-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
    };
  }
  function makeElement(tag) {
    return {
      tag,
      id: '',
      className: '',
      classList: classList(['hidden']),
      innerHTML: '',
      textContent: '',
      children: [],
      onclick: null,
      appendChild(child) { this.children.push(child); },
    };
  }

  const elements = {};
  ['publicDetailName', 'publicDetailAuthor', 'publicDetailTags', 'publicDetailDesc', 'publicDetailClose', 'publicDetailBackdrop', 'publicDetailImport'].forEach((id) => {
    elements[id] = makeElement('div');
  });
  const body = { children: [], appendChild(child) { this.children.push(child); elements[child.id] = child; } };
  const events = [];
  const context = {
    state: { characters: { alpha: { name: 'Alpha' } } },
    document: {
      body,
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return makeElement(tag); },
    },
    importPublicCard: async (card) => { events.push(`import:${card.name}`); },
    loadOrCreateChatForCharacter: (character) => { events.push(`load:${character.name}`); },
    Set,
    Array,
    String,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__template = buildPublicCardDetailModalHtml;\nthis.__author = formatPublicCardDetailAuthor;\nthis.__tags = renderPublicCardDetailTags;\nthis.__elements = getPublicCardDetailModalElements;\nthis.__import = importPublicCardDetailAndOpenChat;\nthis.__show = showPublicCardDetail;`, context);

  assert(context.__template().includes('publicDetailImport'), 'Public card detail helper should include the import button in the modal template.');
  assert(context.__author('Tester') === '作者: Tester' && context.__author('') === '作者: —', 'Public card detail helper should format author text.');
  context.__tags(elements.publicDetailTags, ['AI', 'Guide']);
  assert(elements.publicDetailTags.children.length === 2 && elements.publicDetailTags.children[0].textContent === 'AI', 'Public card detail helper should render tag pills.');
  assert(context.__elements().importButton === elements.publicDetailImport, 'Public card detail helper should collect modal action elements.');

  context.__show({ name: 'Alpha', author: 'Tester', tags: ['AI'], description: 'Desc' });
  const modal = elements.publicCardDetailModal;
  assert(modal && !modal.classList.values.has('hidden') && elements.publicDetailName.textContent === 'Alpha', 'Public card detail modal should render and show selected card data.');
  elements.publicDetailClose.onclick();
  assert(modal.classList.values.has('hidden'), 'Public card detail modal close button should hide the modal.');
  await elements.publicDetailImport.onclick();
  assert(events.includes('import:Alpha') && events.includes('load:Alpha'), 'Public card detail modal import should import and open the character chat.');

  events.length = 0;
  modal.classList.remove('hidden');
  await context.__import(modal, { name: 'Missing' });
  assert(events.join('|') === 'import:Missing' && modal.classList.values.has('hidden'), 'Public card detail modal import should not open chat when the imported card is unavailable.');
}

async function assertFrontendLibraryViewHelpers() {
  const sources = await Promise.all([
    '../../../src/app/library/60-library-sidebar-ui.js',
    '../../../src/app/library/60-library-tabs-ui.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList() {
    const values = new Set();
    return {
      values,
      add(...names) { names.forEach((name) => values.add(name)); },
      remove(...names) { names.forEach((name) => values.delete(name)); },
      toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    };
  }
  function element() {
    return {
      classList: classList(),
      style: {},
      dataset: {},
      value: '',
      _wired: false,
      listeners: {},
      attributes: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      closest() { return this.closestResult || null; },
    };
  }

  const myGrid = element();
  const seriesGrid = element();
  const pubGrid = element();
  const tabMy = element();
  const tabPub = element();
  const tabContributors = element();
  const search = element();
  const convList = element();
  const sidebar = element();
  const charBlock = element();
  const worldBlock = element();
  const fallbackWorldBlock = element();
  let publicRenderCount = 0;
  const context = {
    activeLibraryTab: 'my',
    librarySearchQuery: 'arona',
    publicLibraryLevel: 'series',
    activePublicSeriesId: null,
    libraryAcademyFilter: 'all',
    closeAcademyFilterMenu() {},
    updatePublicLibraryChrome() {},
    renderPublicCards() {
      publicRenderCount++;
      seriesGrid.classList.remove('hidden');
      pubGrid.classList.add('hidden');
    },
    document: {
      getElementById(id) {
        return { myCardsGrid: myGrid, publicSeriesGrid: seriesGrid, publicCardsGrid: pubGrid, tabMy, tabPublic: tabPub, tabContributors, librarySearch: search, convList, sidebar }[id] || null;
      },
      querySelector(selector) {
        if (selector === '#sidebar span[data-i18n="char_card_title"]') return { closest: () => charBlock };
        if (selector === '#sidebar span[data-i18n="world_book"]') return { closest: () => worldBlock };
        if (selector === '#sidebar .glass.rounded-xl.px-3.py-2') return fallbackWorldBlock;
        return null;
      },
      querySelectorAll() { return []; },
    },
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__tab = setActiveTab;\nthis.__tabElements = getLibraryTabElements;\nthis.__wire = wireLibraryTabButtons;\nthis.__search = syncLibrarySearchInput;\nthis.__sidebar = setLibrarySidebarMode;\nthis.__conv = showLibraryConversationList;`, context);

  context.__tab('public');
  assert(myGrid.classList.values.has('hidden') && !seriesGrid.classList.values.has('hidden') && publicRenderCount === 1, 'Library tabs should render the selected catalog.');
  assert(tabPub.classList.values.has('active') && !tabMy.classList.values.has('active'), 'Library tabs should mark the active tab button.');
  assert(context.activeLibraryTab === 'public', 'Library tabs should persist the active tab state.');
  assert(context.__tabElements().tabPub === tabPub, 'Library tabs should collect tab elements from the document.');

  context.__wire();
  assert(tabMy._wired === true && tabPub._wired === true && tabContributors._wired === true && typeof tabMy.listeners.click === 'function', 'Library tab buttons should be wired once.');
  tabMy.listeners.click();
  assert(context.activeLibraryTab === 'my' && !myGrid.classList.values.has('hidden'), 'Library tab button clicks should switch tabs.');

  context.__search();
  assert(search.value === 'arona', 'Library search input should mirror the stored search query.');

  context.__sidebar(true);
  assert(charBlock.style.display === 'none' && worldBlock.style.display === 'none' && fallbackWorldBlock.style.display === 'none', 'Library mode should hide character and world book sidebar sections.');
  assert(sidebar.classList.values.has('library-mode'), 'Library mode should mark the sidebar.');

  context.__sidebar(false);
  assert(charBlock.style.display === '' && worldBlock.style.display === '' && !sidebar.classList.values.has('library-mode'), 'Chat mode should restore sidebar sections.');

  context.__conv();
  assert(convList.style.display === '', 'Library conversation list helper should show the conversation list.');
}
export { assertFrontendPublicCardAssets, assertFrontendLibraryCardFilterHelpers, assertFrontendLibraryCardDisplayHelpers, assertFrontendMyCardGridFiltering, assertFrontendMyCardControlHelpers, assertFrontendMyCardImageUploadHelpers, assertFrontendMyCardActionHelpers, assertFrontendPublicCardGridFiltering, assertFrontendPublicCardListUI, assertFrontendPublicCardImportFlow, assertFrontendLibraryPublicCardDetailModal, assertFrontendLibraryViewHelpers };
