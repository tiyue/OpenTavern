// ==================== Qwen Image Settings ====================
var IMAGE_GENERATION_ALLOWED_SIZES = {
    '2048*2048': true,
    '2688*1536': true,
    '1536*2688': true,
    '2368*1728': true,
    '1728*2368': true
};
var IMAGE_GENERATION_TOKEN_STORAGE_KEY = 'opentavern_qwen_image_token';
var imageGenerationAccessTokenMemory = '';

function ensureImageGenerationSettings() {
    var defs = getImageGenerationDefaultSettings();
    if (!state.settings) state.settings = {};
    var settings = state.settings;
    var legacyNegativePrompt = settings.imageGenerationNegativePrompt == null && typeof settings.comfyNegativePrompt === 'string'
        ? settings.comfyNegativePrompt
        : '';
    var legacyPromptTemplate = settings.imageGenerationPromptTemplate == null && typeof settings.comfyPromptTemplate === 'string'
        ? settings.comfyPromptTemplate
        : '';
    var legacyIncludeCharacter = settings.imageGenerationIncludeCharacter == null
        ? settings.imageGenerationUseCharacter
        : null;
    var legacyIncludeContext = settings.imageGenerationIncludeContext == null
        ? settings.imageGenerationUseChatContext
        : null;

    [
        'imageGenerationEnabled',
        'imageGenerationEndpoint',
        'imageGenerationToken',
        'imageGenerationSize',
        'imageGenerationNegativePrompt',
        'imageGenerationPromptExtend',
        'imageGenerationIncludeCharacter',
        'imageGenerationIncludeContext',
        'imageGenerationPromptTemplate'
    ].forEach(function(key) {
        if (settings[key] === undefined || settings[key] === null) settings[key] = defs[key];
    });

    if (legacyNegativePrompt) settings.imageGenerationNegativePrompt = legacyNegativePrompt;
    if (legacyPromptTemplate) settings.imageGenerationPromptTemplate = legacyPromptTemplate;

    if (legacyIncludeCharacter != null) settings.imageGenerationIncludeCharacter = legacyIncludeCharacter;
    if (legacyIncludeContext != null) settings.imageGenerationIncludeContext = legacyIncludeContext;

    settings.imageGenerationEnabled = normalizeImageGenerationBoolean(settings.imageGenerationEnabled, defs.imageGenerationEnabled);
    settings.imageGenerationEndpoint = normalizeImageGenerationEndpoint(settings.imageGenerationEndpoint);
    settings.imageGenerationSize = normalizeImageGenerationSize(settings.imageGenerationSize);
    settings.imageGenerationNegativePrompt = String(settings.imageGenerationNegativePrompt || '').trim().slice(0, 500);
    settings.imageGenerationPromptExtend = normalizeImageGenerationBoolean(settings.imageGenerationPromptExtend, defs.imageGenerationPromptExtend);
    settings.imageGenerationIncludeCharacter = normalizeImageGenerationBoolean(settings.imageGenerationIncludeCharacter, defs.imageGenerationIncludeCharacter);
    settings.imageGenerationIncludeContext = normalizeImageGenerationBoolean(settings.imageGenerationIncludeContext, defs.imageGenerationIncludeContext);
    settings.imageGenerationPromptTemplate = String(settings.imageGenerationPromptTemplate || '').trim().slice(0, 5000) || defs.imageGenerationPromptTemplate;

    if (settings.imageGenerationToken) saveImageGenerationAccessToken(settings.imageGenerationToken);
    settings.imageGenerationToken = '';
    removeLegacyComfySettings(settings);
    return settings;
}

function getImageGenerationDefaultSettings() {
    if (typeof defaultSettings === 'function') return defaultSettings();
    return {
        imageGenerationEnabled: false,
        imageGenerationEndpoint: '/api/image/generate',
        imageGenerationToken: '',
        imageGenerationSize: '2048*2048',
        imageGenerationNegativePrompt: 'low quality, blurry, bad anatomy, bad hands, malformed text',
        imageGenerationPromptExtend: true,
        imageGenerationIncludeCharacter: true,
        imageGenerationIncludeContext: true,
        imageGenerationPromptTemplate: '{{character}}\n\n{{scene}}\n\n{{context}}'
    };
}

function normalizeImageGenerationBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') return true;
    if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') return false;
    return !!fallback;
}

function normalizeImageGenerationEndpoint(value) {
    value = String(value || '').trim();
    if (!value) return '/api/image/generate';
    if (/^\/(?!\/)/.test(value) || /^\.\.?\//.test(value)) return value;
    if (/^https?:\/\//i.test(value)) {
        if (typeof URL !== 'function') return value;
        try {
            var parsed = new URL(value);
            if (parsed.protocol === 'https:' && parsed.hostname) return value;
            if (parsed.protocol === 'http:' && isAllowedLocalImageGenerationHost(parsed.hostname)) return value;
            if (
                parsed.protocol === 'http:' &&
                typeof window !== 'undefined' &&
                window.location &&
                parsed.origin === window.location.origin
            ) return value;
        } catch (_) {}
    }
    return '/api/image/generate';
}

function isAllowedLocalImageGenerationHost(hostname) {
    hostname = String(hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeImageGenerationSize(value) {
    value = String(value || '').trim();
    return IMAGE_GENERATION_ALLOWED_SIZES[value] ? value : '2048*2048';
}

function getImageGenerationAccessToken() {
    try {
        var stored = localStorage.getItem(IMAGE_GENERATION_TOKEN_STORAGE_KEY);
        if (stored !== null) imageGenerationAccessTokenMemory = String(stored).trim();
    } catch (_) {}
    return imageGenerationAccessTokenMemory;
}

function saveImageGenerationAccessToken(value) {
    imageGenerationAccessTokenMemory = String(value || '').trim();
    try {
        if (imageGenerationAccessTokenMemory) {
            localStorage.setItem(IMAGE_GENERATION_TOKEN_STORAGE_KEY, imageGenerationAccessTokenMemory);
        } else {
            localStorage.removeItem(IMAGE_GENERATION_TOKEN_STORAGE_KEY);
        }
    } catch (_) {}
}

function removeLegacyComfySettings(settings) {
    [
        'comfyEnabled',
        'comfyServer',
        'comfyWorkflow',
        'comfyWorkflowName',
        'comfyPositiveNodeId',
        'comfyNegativeNodeId',
        'comfySeedNodeId',
        'comfyNegativePrompt',
        'comfyPromptTemplate',
        'imageGenerationUseCharacter',
        'imageGenerationUseChatContext'
    ].forEach(function(key) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) delete settings[key];
    });
}
