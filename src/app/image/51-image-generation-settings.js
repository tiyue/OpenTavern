// ==================== Image Generation Settings ====================
var IMAGE_GENERATION_ALLOWED_SIZES = {
    '1024x1024': '1024x1024',
    '1536x1024': '1536x1024',
    '1024x1536': '1024x1536',
    // Historical Qwen sizes remain valid so existing settings are not silently downgraded.
    '2048*2048': '2048*2048',
    '2688*1536': '2688*1536',
    '1536*2688': '1536*2688',
    '2368*1728': '2368*1728',
    '1728*2368': '1728*2368'
};
var IMAGE_GENERATION_SIZE_ALIASES = {
    '1024*1024': '1024x1024',
    '1536*1024': '1536x1024',
    '1024*1536': '1024x1536',
    '2048x2048': '2048*2048',
    '2688x1536': '2688*1536',
    '1536x2688': '1536*2688',
    '2368x1728': '2368*1728',
    '1728x2368': '1728*2368'
};
var IMAGE_GENERATION_TOKEN_STORAGE_KEY = 'opentavern_image_generation_token';
var IMAGE_GENERATION_LEGACY_TOKEN_STORAGE_KEYS = ['opentavern_qwen_image_token'];
var IMAGE_GENERATION_DEFAULT_STYLE_PROMPT = '画面中的人物均为二次元角色，整体参考《碧蓝档案》的高质量日系动画插画风格。';
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
        'imageGenerationStylePrompt',
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
    settings.imageGenerationStylePrompt = String(settings.imageGenerationStylePrompt || '').trim().slice(0, 1000);
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
        imageGenerationSize: '1024x1024',
        imageGenerationStylePrompt: IMAGE_GENERATION_DEFAULT_STYLE_PROMPT,
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
    value = String(value || '').trim().replace(/×/g, 'x');
    if (IMAGE_GENERATION_SIZE_ALIASES[value]) value = IMAGE_GENERATION_SIZE_ALIASES[value];
    return IMAGE_GENERATION_ALLOWED_SIZES[value] || '1024x1024';
}

function getImageGenerationAccessToken() {
    try {
        var stored = localStorage.getItem(IMAGE_GENERATION_TOKEN_STORAGE_KEY);
        var readFromLegacyKey = false;
        if (stored === null) {
            for (var i = 0; i < IMAGE_GENERATION_LEGACY_TOKEN_STORAGE_KEYS.length; i++) {
                stored = localStorage.getItem(IMAGE_GENERATION_LEGACY_TOKEN_STORAGE_KEYS[i]);
                if (stored !== null) {
                    readFromLegacyKey = true;
                    break;
                }
            }
        }
        if (stored !== null) imageGenerationAccessTokenMemory = String(stored).trim();
        if (readFromLegacyKey && imageGenerationAccessTokenMemory) {
            localStorage.setItem(IMAGE_GENERATION_TOKEN_STORAGE_KEY, imageGenerationAccessTokenMemory);
            IMAGE_GENERATION_LEGACY_TOKEN_STORAGE_KEYS.forEach(function(key) {
                localStorage.removeItem(key);
            });
        }
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
        IMAGE_GENERATION_LEGACY_TOKEN_STORAGE_KEYS.forEach(function(key) {
            localStorage.removeItem(key);
        });
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
