import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendCloudSyncLegacyStatusMigration() {
  const source = await readFile(new URL('../../../src/app/settings/68-settings-cloud-sync-ui.js', import.meta.url), 'utf8');
  const context = {
    state: {
      settings: {
        cloudSyncEncrypted: false,
        cloudSyncLastStatus: '云端上传失败：当前页面不支持浏览器加密同步。HTTP/IP 访问通常无法使用 WebCrypto；请关闭“加密上传内容”，或改用 HTTPS 域名后再开启加密。',
      },
    },
    String,
  };
  vm.runInNewContext(`${source}\nthis.__migrate = migrateLegacyCloudSyncWebCryptoStatus;`, context);

  assert(context.__migrate() === true, 'A stale WebCrypto upload error should migrate after encryption is already disabled.');
  assert(context.state.settings.cloudSyncLastStatus.includes('可使用未加密的增量同步'), 'The migrated status should tell the user that plaintext incremental sync can be retried.');
  assert(!context.state.settings.cloudSyncLastStatus.includes('改用 HTTPS'), 'The migrated status must not keep the obsolete HTTPS requirement.');
  assert(context.__migrate() === false, 'The legacy status migration should be idempotent.');

  context.state.settings.cloudSyncEncrypted = true;
  context.state.settings.cloudSyncLastStatus = '当前页面不支持浏览器加密同步。';
  assert(context.__migrate() === false, 'An enabled legacy encryption setting must keep its blocking status until explicitly disabled.');
}

async function assertFrontendSettingsSaveHelpers() {
  const sources = await Promise.all([
    '../../../src/app/settings/68-settings-cloud-sync-form.js',
    '../../../src/app/settings/68-settings-save-form-helpers.js',
    '../../../src/app/settings/68-settings-save-main-form.js',
    '../../../src/app/settings/68-settings-save-summary-form.js',
    '../../../src/app/settings/68-settings-save-ui-form.js',
    '../../../src/app/settings/68-settings-save-summary-api-form.js',
    '../../../src/app/image/51-image-generation-settings.js',
    '../../../src/app/settings/68-settings-save-image-form.js',
    '../../../src/app/settings/68-settings-save-form.js',
    '../../../src/app/settings/68-settings-save-effect-helpers.js',
    '../../../src/app/settings/68-settings-save-effects.js',
    '../../../src/app/settings/68-settings-save.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  const events = [];
  const activeConv = { _wiCache: { stale: true } };
  const classList = {
    values: new Set(),
    add(value) { this.values.add(value); },
  };
  const input = (value) => ({ value });
  const checkbox = (checked) => ({ checked });
  const storedImageTokens = {};
  const context = {
    state: { settings: {} },
    dom: {
      apiEndpoint: input(' https://api.example/v1 '),
      apiKey: input(' key '),
      saveApiKey: checkbox(true),
      modelName: input(' model-a '),
      contextLength: input('32'),
      maxTokens: input('2048'),
      temperature: input('0.4'),
      topP: input('0.8'),
      userName: input(' Sensei '),
      systemPrompt: input(' system '),
      postHistoryInstructions: input(' post '),
      twoStageEnabled: checkbox(true),
      twoStageTemperature: input('0.25'),
      twoStageTopP: input('0.75'),
      twoStageIncludeRecentContext: checkbox(true),
      twoStageSystemPrompt: input(''),
      twoStagePostHistoryInstructions: input(' two post '),
      requestCotEnabled: checkbox(true),
      showCotEnabled: checkbox(true),
      userDescription: input(' user desc '),
      summaryEnabled: checkbox(true),
      summaryThreshold: input('18'),
      summaryMaxWords: input('600'),
      summaryPrompt: input(' summarize '),
      worldInfoBudgetEnabled: checkbox(true),
      worldInfoBudget: input('4096'),
      uiTheme: input('new-dark'),
      lowPowerMode: checkbox(true),
      summarizeUseMainAPI: checkbox(false),
      summarizeApiEndpoint: input(' https://summary.example '),
      summarizeApiKey: input(' summary-key '),
      summarizeModel: input(' summary-model '),
      imageGenerationEnabled: checkbox(true),
      imageGenerationEndpoint: input(' https://image.example/api/generate '),
      imageGenerationToken: input(' gateway-token '),
      imageGenerationSize: input('1536*2688'),
      imageGenerationStylePrompt: input(' custom anime style '),
      imageGenerationNegativePrompt: input(' low quality '),
      imageGenerationPromptExtend: checkbox(false),
      imageGenerationIncludeCharacter: checkbox(false),
      imageGenerationIncludeContext: checkbox(true),
      imageGenerationPromptTemplate: input(''),
      cloudSyncEnabled: checkbox(true),
      cloudSyncAutoUpload: checkbox(true),
      cloudSyncEndpoint: input('   '),
      cloudSyncToken: input(' cloud-token '),
      cloudSyncEncrypted: checkbox(true),
      cloudSyncPassphrase: input(' pass phrase '),
      settingsModal: { classList },
    },
    document: {
      getElementById() { return null; },
    },
    DEFAULT_TWO_STAGE_PROMPT: 'default two stage',
    ensureSillyTavernPresetSettings() { events.push('preset'); },
    normalizeUiTheme(value) { events.push('theme-normalize'); return value; },
    cacheUiTheme(value) { events.push(`cache:${value}`); },
    readInterfaceBehaviorSettingsFromForm() { events.push('interface-behavior'); },
    defaultSettings() {
      return {
        imageGenerationEnabled: false,
        imageGenerationEndpoint: '/api/image/generate',
        imageGenerationToken: '',
        imageGenerationSize: '1024x1024',
        imageGenerationStylePrompt: 'default anime style',
        imageGenerationNegativePrompt: 'default negative prompt',
        imageGenerationPromptExtend: true,
        imageGenerationIncludeCharacter: true,
        imageGenerationIncludeContext: true,
        imageGenerationPromptTemplate: 'default image template',
      };
    },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(storedImageTokens, key) ? storedImageTokens[key] : null; },
      setItem(key, value) { storedImageTokens[key] = String(value); },
      removeItem(key) { delete storedImageTokens[key]; },
    },
    ensureCloudSyncSettings() { events.push('cloud'); },
    persistState() { events.push('persist'); },
    applyUiTheme(value) { events.push(`apply-theme:${value}`); },
    applyPerformanceMode(value) { events.push(`perf:${value}`); },
    updateInputState() { events.push('input'); },
    getActiveConv() { return activeConv; },
    renderTokenBar() { events.push('token'); },
    autoSummarize() { events.push('auto'); },
    appStore: { notify(key) { events.push(`notify:${key}`); } },
    setTimeout(fn) { fn(); },
    parseInt,
    parseFloat,
    Number,
    Set,
    URL,
    window: { location: new URL('http://192.0.2.10:8888/') },
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__close = closeSettings;\nthis.__clearWi = clearActiveConversationWorldInfoCache;\nthis.__rawOr = readControlValueOr;\nthis.__trimOr = readTrimmedControlValueOr;\nthis.__checkbox = readCheckboxControlValue;\nthis.__finiteFloat = readFiniteFloatControlValue;\nthis.__normalizeImageEndpoint = normalizeImageGenerationEndpoint;`, context);
  assert(context.__rawOr(input('  raw  '), 'fallback') === '  raw  ', 'Settings save form helper should preserve raw control values when requested.');
  assert(context.__trimOr(input('  '), 'fallback') === 'fallback', 'Settings save form helper should default blank trimmed values.');
  assert(context.__checkbox(null, true) === true, 'Settings save form helper should use checkbox fallback values.');
  assert(context.__finiteFloat(input('0'), 0.3) === 0 && context.__finiteFloat(input('NaN'), 0.3) === 0.3, 'Settings save form helper should preserve finite floats and default invalid values.');
  assert(context.__normalizeImageEndpoint('https://images.example/generate') === 'https://images.example/generate', 'Image generation should allow HTTPS gateway endpoints.');
  assert(context.__normalizeImageEndpoint('http://192.0.2.10:8888/api/image/generate') === 'http://192.0.2.10:8888/api/image/generate', 'Image generation should allow the current same-origin HTTP gateway during migration.');
  assert(context.__normalizeImageEndpoint('http://localhost:8787/api/image/generate') === 'http://localhost:8787/api/image/generate', 'Image generation should allow local development gateways.');
  assert(context.__normalizeImageEndpoint('http://untrusted.example/generate') === '/api/image/generate', 'Image generation must not send a stored gateway token to an arbitrary plaintext HTTP host.');
  activeConv._wiCache = { stale: true };
  context.__clearWi();
  assert(activeConv._wiCache === null, 'Settings save effects helper should clear the active world-info cache.');
  context.__close();

  assert(context.state.settings.apiEndpoint === 'https://api.example/v1', 'Settings save should trim API endpoint.');
  assert(context.state.settings.model === 'model-a' && context.state.settings.contextLength === 32, 'Settings save should read model and context length.');
  assert(context.state.settings.twoStageSystemPrompt === 'default two stage', 'Settings save should default empty two-stage prompt.');
  assert(context.state.settings.uiTheme === 'new-dark' && context.state.settings.lowPowerMode === true, 'Settings save should read UI behavior settings.');
  assert(context.state.settings.imageGenerationEndpoint === 'https://image.example/api/generate', 'Settings save should normalize the image gateway endpoint.');
  assert(context.state.settings.imageGenerationPromptTemplate === 'default image template', 'Settings save should default an empty image prompt template.');
  assert(context.state.settings.imageGenerationToken === '' && storedImageTokens.opentavern_image_generation_token === 'gateway-token', 'Settings save must keep the image gateway token outside persisted settings under the provider-neutral key.');
  assert(context.state.settings.imageGenerationSize === '1536*2688', 'Settings save should preserve a legacy high-resolution image size.');
  assert(context.state.settings.imageGenerationStylePrompt === 'custom anime style', 'Settings save should trim and persist the editable image style prompt.');
  assert(context.state.settings.cloudSyncEndpoint === '/api/sync', 'Settings save should default empty cloud sync endpoint.');
  assert(context.state.settings.cloudSyncToken === 'cloud-token', 'Settings save should trim cloud sync token.');
  assert(context.state.settings.cloudSyncPassphrase === ' pass phrase ', 'Settings save should preserve cloud sync passphrase exactly.');
  assert(classList.values.has('hidden'), 'Settings save should hide the modal.');
  assert(activeConv._wiCache === null, 'Settings save should clear world-info cache.');
  assert(events.includes('persist') && events.includes('apply-theme:new-dark') && events.includes('perf:true') && events.includes('notify:settings'), 'Settings save effects did not run.');
  assert(events.includes('auto'), 'Settings save should trigger auto summarize when enabled.');
}

async function assertFrontendSettingsHydrationHelpers() {
  const sources = await Promise.all([
    '../../../src/app/settings/68-settings-draft.js',
    '../../../src/app/image/51-image-generation-settings.js',
    '../../../src/app/settings/68-settings-basic-hydration.js',
    '../../../src/app/settings/68-settings-advanced-hydration-helpers.js',
    '../../../src/app/settings/68-settings-advanced-hydration.js',
    '../../../src/app/settings/68-settings-integration-hydration.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function input(value = '') {
    return {
      value,
      textContent: '',
      checked: false,
      listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
    };
  }

  const events = [];
  const localImageTokens = { opentavern_qwen_image_token: 'gateway-token' };
  const context = {
    state: { settings: {
      apiEndpoint: 'https://api.example',
      apiKey: 'key',
      saveApiKey: true,
      model: 'model-a',
      contextLength: 32,
      maxTokens: 2048,
      temperature: 0.4,
      topP: 0.8,
      userName: 'Sensei',
      systemPrompt: 'system',
      postHistoryInstructions: 'post',
      userDescription: 'desc',
      twoStageEnabled: true,
      twoStageTemperature: 0.25,
      twoStageTopP: 0.75,
      twoStageIncludeRecentContext: true,
      twoStageSystemPrompt: '',
      twoStagePostHistoryInstructions: 'two post',
      requestCotEnabled: true,
      showCotEnabled: false,
      summaryEnabled: true,
      summaryThreshold: 18,
      summaryMaxWords: 600,
      summaryPrompt: 'summary',
      worldInfoBudgetEnabled: true,
      worldInfoBudget: 4096,
      uiTheme: 'new-dark',
      lowPowerMode: true,
      summarizeUseMainAPI: false,
      summarizeApiEndpoint: 'https://summary.example',
      summarizeApiKey: 'summary-key',
      summarizeModel: 'summary-model',
      imageGenerationEnabled: true,
      imageGenerationEndpoint: 'https://image.example/api/generate',
      imageGenerationToken: '',
      imageGenerationSize: '2368*1728',
      imageGenerationStylePrompt: 'custom anime style',
      imageGenerationNegativePrompt: 'neg',
      imageGenerationPromptExtend: false,
      imageGenerationIncludeCharacter: true,
      imageGenerationIncludeContext: false,
      imageGenerationPromptTemplate: 'template',
    } },
    dom: {
      apiEndpoint: input(), apiKey: input(), saveApiKey: input(), modelName: input(),
      contextLength: input(), contextLenVal: input(), maxTokens: input(), maxTokensVal: input(), temperature: input(), tempVal: input(), topP: input(), topPVal: input(),
      userName: input(), systemPrompt: input(), postHistoryInstructions: input(), userDescription: input(), fillRoleplayPromptBtn: input(), fillPostHistoryBtn: input(),
      twoStageEnabled: input(), twoStageTemperature: input(), twoStageTempVal: input(), twoStageTopP: input(), twoStageTopPVal: input(), twoStageIncludeRecentContext: input(), twoStageSystemPrompt: input(), twoStagePostHistoryInstructions: input(), requestCotEnabled: input(), showCotEnabled: input(), restoreTwoStagePromptBtn: input(),
      summaryEnabled: input(), summaryThreshold: input(), summaryThresholdVal: input(), summaryMaxWords: input(), summaryPrompt: input(),
      worldInfoBudgetEnabled: input(), worldInfoBudget: input(), worldInfoBudgetVal: input(), uiTheme: input(), lowPowerMode: input(),
      summarizeUseMainAPI: input(), summarizeApiEndpoint: input(), summarizeApiKey: input(), summarizeModel: input(),
      imageGenerationEnabled: input(), imageGenerationEndpoint: input(), imageGenerationToken: input(), imageGenerationSize: input(), imageGenerationStylePrompt: input(), imageGenerationNegativePrompt: input(), imageGenerationPromptExtend: input(), imageGenerationIncludeCharacter: input(), imageGenerationIncludeContext: input(), imageGenerationPromptTemplate: input(),
    },
    BASE_SYSTEM_PROMPT: 'base system',
    DEFAULT_FIRST_STAGE_POST_HISTORY_INSTRUCTIONS: 'default post',
    DEFAULT_TWO_STAGE_PROMPT: 'default two stage',
    persistState: () => events.push('persist'),
    updateSummaryThresholdWarning: () => events.push('summary-warning'),
    ensureSillyTavernPresetSettings: () => events.push('st-ensure'),
    renderSillyTavernPresetSettings: () => events.push('st-render'),
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(localImageTokens, key) ? localImageTokens[key] : null; },
      setItem(key, value) { localImageTokens[key] = String(value); },
      removeItem(key) { delete localImageTokens[key]; },
    },
    parseInt,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__primary = hydratePrimaryApiSettings;\nthis.__generation = hydrateGenerationSettings;\nthis.__prompt = hydratePromptSettings;\nthis.__two = hydrateTwoStageSettings;\nthis.__summary = hydrateSummarySettings;\nthis.__budget = hydrateWorldInfoBudgetSettings;\nthis.__theme = hydrateThemePerformanceSettings;\nthis.__summaryApi = hydrateSummarizationApiSettings;\nthis.__st = hydrateSillyTavernPresetSettings;\nthis.__image = hydrateImageGenerationSettingsControls;\nthis.__defaultOn = hydrateCheckboxControlDefaultOn;\nthis.__restorePrompt = bindDefaultPromptRestoreButton;`, context);

  context.__primary();
  context.__generation();
  context.__prompt();
  context.__two();
  context.__summary();
  context.__budget();
  context.__theme();
  context.__summaryApi();
  context.__st();
  context.__image();

  const defaultOnCheckbox = input();
  context.__defaultOn(defaultOnCheckbox, undefined);
  assert(defaultOnCheckbox.checked === true, 'Settings advanced hydration helper should default checkboxes on.');
  const restoreBtn = input();
  const restorePrompt = input('custom');
  context.__restorePrompt(restoreBtn, restorePrompt, 'restored prompt');
  restoreBtn.onclick();
  assert(restorePrompt.value === 'restored prompt' && context.state.settings.twoStageSystemPrompt === 'restored prompt' && !events.includes('persist'), 'Restoring a default prompt should update the form target without prematurely persisting it.');

  assert(context.dom.apiEndpoint.value === 'https://api.example' && context.dom.saveApiKey.checked === true, 'Settings hydration should fill primary API controls.');
  assert(context.dom.contextLenVal.textContent === 32 && context.dom.tempVal.textContent === 0.4, 'Settings hydration should fill generation slider labels.');
  assert(context.dom.twoStageSystemPrompt.value === 'default two stage' && context.dom.showCotEnabled.checked === false, 'Settings hydration should fill two-stage controls.');
  assert(context.dom.summaryThresholdVal.textContent === 18 && context.dom.summaryMaxWords.value === 600, 'Settings hydration should fill summary controls.');
  assert(context.dom.worldInfoBudgetVal.textContent === 4096 && context.dom.uiTheme.value === 'new-dark', 'Settings hydration should fill world info and theme controls.');
  assert(context.dom.summarizeApiEndpoint.value === 'https://summary.example' && context.dom.imageGenerationEndpoint.value === 'https://image.example/api/generate', 'Settings hydration should fill integration controls.');
  assert(context.dom.imageGenerationToken.value === 'gateway-token' && context.dom.imageGenerationSize.value === '2368*1728', 'Settings hydration should read the legacy local image token and preserve the legacy size.');
  assert(localImageTokens.opentavern_image_generation_token === 'gateway-token', 'Settings hydration should migrate the legacy Qwen token key to the provider-neutral key.');
  assert(!Object.prototype.hasOwnProperty.call(localImageTokens, 'opentavern_qwen_image_token'), 'Settings hydration should remove the duplicated legacy token after a successful migration.');
  assert(context.dom.imageGenerationStylePrompt.value === 'custom anime style', 'Settings hydration should fill the editable image style prompt.');
  assert(events.includes('st-ensure') && events.includes('summary-warning'), 'Settings hydration should call dependent render/status helpers.');

  const shortcutPersistCountBefore = events.filter((event) => event === 'persist').length;
  context.dom.fillRoleplayPromptBtn.onclick();
  context.dom.restoreTwoStagePromptBtn.onclick();
  assert(context.state.settings.systemPrompt === 'base system' && context.state.settings.twoStageSystemPrompt === 'default two stage', 'Settings hydration shortcut buttons should restore defaults.');
  assert(events.filter((event) => event === 'persist').length === shortcutPersistCountBefore, 'Default-prompt shortcuts should leave persistence to the settings completion action.');
}

async function assertFrontendSettingsStorageClearHelpers() {
  const source = await readFile(new URL('../../../src/app/settings/68-settings-storage-clear-helpers.js', import.meta.url), 'utf8');
  let storageInfoUpdated = 0;
  const elements = {
    storageUsage: { textContent: '' },
    storageUsageBar: { style: {} },
  };
  const context = {
    t: () => '',
    updateStorageInfo() {
      storageInfoUpdated += 1;
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
  };

  vm.runInNewContext(`${source}\nthis.__style = getClearAllStorageButtonStyle;\nthis.__apply = applyClearAllStorageButtonState;\nthis.__clearConfig = getClearAllStorageConfirmConfig;\nthis.__renderCleared = renderStorageUsageClearedState;`, context);

  assert(context.__style('idb').background === 'rgba(239,68,68,0.15)', 'Storage clear helper should use danger styling for IndexedDB.');
  assert(context.__style('localStorage').color === '#fbbf24', 'Storage clear helper should use warning styling for fallback storage.');

  const btn = { style: {}, textContent: '' };
  context.__apply(btn, 'idb');
  assert(btn.style.display === 'flex' && btn.textContent.includes('OPFS'), 'Storage clear helper should show and label the clear button.');

  const clearConfig = context.__clearConfig();
  assert(clearConfig.options.danger === true && clearConfig.options.okText, 'Storage clear confirmation should be marked dangerous.');

  context.__renderCleared();
  assert(storageInfoUpdated === 1 && elements.storageUsage.textContent.includes('\u5df2\u6e05\u9664') && elements.storageUsageBar.style.width === '0%', 'Storage clear helper should refresh cleared usage UI.');
}
export { assertFrontendCloudSyncLegacyStatusMigration, assertFrontendSettingsSaveHelpers, assertFrontendSettingsHydrationHelpers, assertFrontendSettingsStorageClearHelpers };
