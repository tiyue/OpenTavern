/**
 * 新手导读（文件：30-state-user-personas.js）
 *
 * 负责什么：规范化多套用户设定，并把当前对话选中的设定同步到旧版 userName / userDescription 字段。
 * 在程序中的位置：状态仓库创建后、会话模型创建前加载，供启动迁移、设置界面和切换会话共同调用。
 * 从哪里开始看：从 `ensureUserPersonaSettings(settings)`、`activateUserPersona(id, conv, remember)` 开始阅读。
 * 修改时注意：旧版提示词代码仍读取 userName / userDescription，这两个兼容字段必须始终与当前设定同步。
 */
var DEFAULT_USER_PERSONA_ID = 'default';

function getDefaultUserPersonaName(settings) {
    var lang = settings && settings.lang;
    if (lang === 'en') return 'Default Persona';
    if (lang === 'zh-TW') return '預設設定';
    return '默认设定';
}

function normalizeUserPersonaRecord(record, index, legacy, settings) {
    var source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    var fallback = legacy || {};
    var id = String(source.id || (index === 0 ? DEFAULT_USER_PERSONA_ID : 'persona-' + (index + 1))).trim();
    var fallbackName = index === 0 ? getDefaultUserPersonaName(settings) : 'Persona ' + (index + 1);
    var name = String(source.name || fallbackName).trim() || fallbackName;
    return {
        ...source,
        id: id || (index === 0 ? DEFAULT_USER_PERSONA_ID : 'persona-' + (index + 1)),
        name: name,
        userName: String(source.userName || fallback.userName || 'User').trim() || 'User',
        description: String(source.description != null ? source.description : (fallback.description || ''))
    };
}

function ensureUserPersonaSettings(settings) {
    settings = settings || state.settings;
    var legacy = {
        userName: settings.userName || 'User',
        description: settings.userDescription || ''
    };
    var source = Array.isArray(settings.userPersonas) && settings.userPersonas.length
        ? settings.userPersonas
        : [legacy];
    if (source.length === 1 && source[0] && source[0].id === DEFAULT_USER_PERSONA_ID &&
        (legacy.userName !== 'User' || legacy.description) &&
        (source[0].userName || 'User') === 'User' && !source[0].description) {
        source = [{
            id: DEFAULT_USER_PERSONA_ID,
            name: source[0].name || getDefaultUserPersonaName(settings),
            userName: legacy.userName,
            description: legacy.description
        }];
    }
    var seen = Object.create(null);
    settings.userPersonas = source.map(function(record, index) {
        var persona = normalizeUserPersonaRecord(record, index, legacy, settings);
        var baseId = persona.id;
        var suffix = 2;
        while (seen[persona.id]) persona.id = baseId + '-' + suffix++;
        seen[persona.id] = true;
        return persona;
    });

    var activeId = String(settings.activeUserPersonaId || '').trim();
    if (!seen[activeId]) activeId = settings.userPersonas[0].id;
    settings.activeUserPersonaId = activeId;
    syncLegacyUserPersonaFields(settings, activeId);
    return settings.userPersonas;
}

function getUserPersonaById(id, settings) {
    settings = settings || state.settings;
    var personas = ensureUserPersonaSettings(settings);
    var wanted = String(id || '');
    for (var i = 0; i < personas.length; i++) {
        if (personas[i].id === wanted) return personas[i];
    }
    return null;
}

function syncLegacyUserPersonaFields(settings, id) {
    var personas = Array.isArray(settings.userPersonas) ? settings.userPersonas : [];
    var persona = null;
    for (var i = 0; i < personas.length; i++) {
        if (personas[i].id === id) {
            persona = personas[i];
            break;
        }
    }
    if (!persona) persona = personas[0];
    if (!persona) return null;
    settings.activeUserPersonaId = persona.id;
    settings.userName = persona.userName || 'User';
    settings.userDescription = persona.description || '';
    return persona;
}

function getActiveConversationForPersona() {
    return state.conversations && state.activeConvId ? state.conversations[state.activeConvId] : null;
}

function activateUserPersona(id, conv, remember) {
    ensureUserPersonaSettings(state.settings);
    var persona = getUserPersonaById(id, state.settings) || state.settings.userPersonas[0];
    syncLegacyUserPersonaFields(state.settings, persona.id);
    if (remember !== false) {
        var targetConv = conv || getActiveConversationForPersona();
        if (targetConv) targetConv.userPersonaId = persona.id;
    }
    return persona;
}

function syncActiveConversationUserPersona() {
    ensureUserPersonaSettings(state.settings);
    var conv = getActiveConversationForPersona();
    var persona = conv && getUserPersonaById(conv.userPersonaId, state.settings);
    if (!persona) {
        persona = getUserPersonaById(state.settings.activeUserPersonaId, state.settings) || state.settings.userPersonas[0];
        if (conv) conv.userPersonaId = persona.id;
    }
    syncLegacyUserPersonaFields(state.settings, persona.id);
    return persona;
}

function updateActiveUserPersona(values) {
    ensureUserPersonaSettings(state.settings);
    var persona = getUserPersonaById(state.settings.activeUserPersonaId, state.settings) || state.settings.userPersonas[0];
    values = values || {};
    if (Object.prototype.hasOwnProperty.call(values, 'name')) {
        persona.name = String(values.name || '').trim() || getDefaultUserPersonaName(state.settings);
    }
    if (Object.prototype.hasOwnProperty.call(values, 'userName')) {
        persona.userName = String(values.userName || '').trim() || 'User';
    }
    if (Object.prototype.hasOwnProperty.call(values, 'description')) {
        persona.description = String(values.description || '');
    }
    syncLegacyUserPersonaFields(state.settings, persona.id);
    var conv = getActiveConversationForPersona();
    if (conv) conv.userPersonaId = persona.id;
    return persona;
}

function createUserPersonaId() {
    if (typeof makeId === 'function') return 'persona-' + makeId();
    return 'persona-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
