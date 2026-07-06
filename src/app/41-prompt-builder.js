// ==================== Prompt Builder ====================
// World Info position constants (must be defined early)
var WI_POS = {
    BEFORE_CHAR: 0, AFTER_CHAR: 1,
    BEFORE_EX: 2, AFTER_EX: 3,
    TOP_AN: 4, BOTTOM_AN: 5,
    AT_DEPTH: 6, OUTLET: 7
};
var WI_ROLE = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

/**
 * Normalize a single world info entry from SillyTavern / character_book format
 * (which may use "keys", "secondary_keys", "insertion_order", "enabled", string position,
 * and put advanced fields inside "extensions") into the app's internal schema
 * (key, keysecondary, order, disable, numeric position, top-level scanDepth etc.).
 * This fixes "某些字段无法读取" when importing embedded world books.
 */
function normalizeWIEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var e = JSON.parse(JSON.stringify(raw));

    // Map ST keys to internal key / keysecondary
    if (Array.isArray(e.keys) && (!e.key || e.key.length === 0)) {
        e.key = e.keys.slice();
    }
    if (!Array.isArray(e.key)) e.key = [];

    if (Array.isArray(e.secondary_keys) && (!e.keysecondary || e.keysecondary.length === 0)) {
        e.keysecondary = e.secondary_keys.slice();
    }
    if (!Array.isArray(e.keysecondary)) e.keysecondary = [];

    // insertion_order → order
    if (e.insertion_order != null && e.order == null) {
        e.order = e.insertion_order;
    }
    if (e.order == null) e.order = 100;

    // enabled (ST) → disable (internal, inverted)
    if (e.enabled != null && e.disable == null) {
        e.disable = !e.enabled;
    }
    if (e.disable == null) e.disable = false;

    // position: string (after_char etc) or number → numeric constant
    if (typeof e.position === 'string') {
        var p = e.position.toLowerCase().replace(/_/g, '');
        var posMap = {
            'beforechar': WI_POS.BEFORE_CHAR,
            'afterchar': WI_POS.AFTER_CHAR,
            'beforeex': WI_POS.BEFORE_EX,
            'beforeexample': WI_POS.BEFORE_EX,
            'afterex': WI_POS.AFTER_EX,
            'afterexample': WI_POS.AFTER_EX,
            'topan': WI_POS.TOP_AN,
            'bottoman': WI_POS.BOTTOM_AN,
            'atdepth': WI_POS.AT_DEPTH,
            'outlet': WI_POS.OUTLET
        };
        if (posMap[p] != null) {
            e.position = posMap[p];
        }
    }
    if (e.position == null || isNaN(parseInt(e.position, 10))) {
        e.position = WI_POS.AFTER_CHAR;
    } else {
        e.position = parseInt(e.position, 10);
    }

    // Promote fields from extensions (common in ST exports / character_book)
    if (e.extensions && typeof e.extensions === 'object') {
        var ext = e.extensions;

        // numeric / core
        if (ext.scan_depth != null && e.scanDepth == null) e.scanDepth = ext.scan_depth;
        if (ext.depth != null && e.depth == null) e.depth = ext.depth;
        if (ext.role != null && e.role == null) e.role = ext.role;
        if (ext.probability != null && e.probability == null) e.probability = ext.probability;
        if (ext.useProbability != null && e.useProbability == null) e.useProbability = ext.useProbability;
        if (ext.selectiveLogic != null && e.selectiveLogic == null) e.selectiveLogic = ext.selectiveLogic;

        // timed
        if (ext.sticky != null && e.sticky == null) e.sticky = ext.sticky;
        if (ext.cooldown != null && e.cooldown == null) e.cooldown = ext.cooldown;
        if (ext.delay != null && e.delay == null) e.delay = ext.delay;

        // recursion
        if (ext.exclude_recursion != null && e.excludeRecursion == null) e.excludeRecursion = ext.exclude_recursion;
        if (ext.prevent_recursion != null && e.preventRecursion == null) e.preventRecursion = ext.prevent_recursion;
        if (ext.delay_until_recursion != null && e.delayUntilRecursion == null) e.delayUntilRecursion = ext.delay_until_recursion;

        // group / outlet
        if (ext.outlet_name != null && e.outletName == null) e.outletName = ext.outlet_name;
        if (ext.group != null && e.group == null) e.group = ext.group;
        if (ext.group_override != null && e.groupOverride == null) e.groupOverride = ext.group_override;
        if (ext.group_weight != null && e.groupWeight == null) e.groupWeight = ext.group_weight;
        if (ext.use_group_scoring != null && e.useGroupScoring == null) e.useGroupScoring = ext.use_group_scoring;

        // other
        if (ext.automation_id != null && e.automationId == null) e.automationId = ext.automation_id;
        if (ext.triggers && !e.triggers) e.triggers = ext.triggers;
        if (ext.ignore_budget != null && e.ignoreBudget == null) e.ignoreBudget = ext.ignore_budget;

        // matching flags
        if (ext.case_sensitive != null && e.caseSensitive == null) e.caseSensitive = ext.case_sensitive;
        if (ext.match_whole_words != null && e.matchWholeWords == null) e.matchWholeWords = ext.match_whole_words;
        if (ext.match_character_description != null) e.matchCharacterDescription = ext.match_character_description;
        if (ext.match_character_personality != null) e.matchCharacterPersonality = ext.match_character_personality;
        if (ext.match_scenario != null) e.matchScenario = ext.match_scenario;
        if (ext.match_persona_description != null) e.matchPersonaDescription = ext.match_persona_description;
        if (ext.match_character_depth_prompt != null) e.matchCharacterDepthPrompt = ext.match_character_depth_prompt;
        if (ext.match_creator_notes != null) e.matchCreatorNotes = ext.match_creator_notes;
    }

    // Ensure required arrays / objects
    if (!Array.isArray(e.key)) e.key = [];
    if (!Array.isArray(e.keysecondary)) e.keysecondary = [];
    if (!Array.isArray(e.triggers)) e.triggers = [];
    if (!e.characterFilter) e.characterFilter = { isExclude: false, names: [], tags: [] };

    // Ensure extensions for round-tripping / ST export
    if (!e.extensions) e.extensions = {};
    // keep some in sync
    e.extensions.position = e.position;
    if (e.depth != null) e.extensions.depth = e.depth;
    if (e.role != null) e.extensions.role = e.role;

    return e;
}

function injectWorldInfoIntoSystem(systemParts, wiByPos, charName, userName) {
    if (!wiByPos) return systemParts;

    function joinEntries(list) {
        if (!list || !list.length) return '';
        return list.map(function(e) {
            return replacePlaceholders(e.content || '', charName, userName);
        }).join('\n\n');
    }

    var before = joinEntries(wiByPos[WI_POS.BEFORE_CHAR] || []);
    var after = joinEntries(wiByPos[WI_POS.AFTER_CHAR] || []);
    var beforeEx = joinEntries(wiByPos[WI_POS.BEFORE_EX] || []);
    var afterEx = joinEntries(wiByPos[WI_POS.AFTER_EX] || []);
    var topAN = joinEntries(wiByPos[WI_POS.TOP_AN] || []);
    var botAN = joinEntries(wiByPos[WI_POS.BOTTOM_AN] || []);

    if (before) systemParts.unshift(before);
    if (after) systemParts.push(after);

    if (beforeEx) systemParts.push('Example context (lore):\n' + beforeEx);
    if (afterEx) systemParts.push('Example context (lore):\n' + afterEx);

    if (topAN || botAN) {
        var an = [];
        if (topAN) an.push(topAN);
        if (botAN) an.push(botAN);
        systemParts.push("[Author's Note / World Lore]\n" + an.join('\n'));
    }

    return systemParts;
}

function buildSystemPrompt(character, worldInfoByPos) {
    var parts = [];
    var charName = character ? character.name : 'Assistant';
    var userName = state.settings.userName || 'User';

    var sysPrompt = state.settings.systemPrompt;
    if (!sysPrompt && character && character.system_prompt) {
        sysPrompt = character.system_prompt;
    }
    if (sysPrompt) {
        parts.push(replacePlaceholders(sysPrompt, charName, userName));
    }

    // Inject user description / persona (user's own setting)
    var userDesc = state.settings.userDescription || '';
    if (userDesc && userDesc.trim()) {
        parts.push('User\'s Persona: ' + replacePlaceholders(userDesc.trim(), charName, userName));
    }

    var postHistory = getEffectivePostHistoryInstructions(character);
    if (postHistory) {
        parts.push(replacePlaceholders(postHistory, charName, userName));
    }

    if (character) {
        var charInfo = [];
        if (character.personality) charInfo.push('Personality: ' + replacePlaceholders(character.personality, charName, userName));
        if (character.scenario) charInfo.push('Scenario: ' + replacePlaceholders(character.scenario, charName, userName));
        if (character.description) charInfo.push(replacePlaceholders(character.description, charName, userName));
        if (charInfo.length > 0) parts.push(charInfo.join('\n\n'));
    }

    // World Info injection (before/after char + example/AN positions)
    if (worldInfoByPos) {
        parts = injectWorldInfoIntoSystem(parts, worldInfoByPos, charName, userName);
    }

    if (character && character.mes_example) {
        parts.push('Example dialogues:\n' + replacePlaceholders(character.mes_example, charName, userName));
    }

    return parts.join('\n\n').trim();
}

function buildSecondStageContextPrompt(conv, worldInfoByPos, focusSpeakerName) {
    var parts = [];
    var isGroup = isGroupChat(conv);
    var userName = state.settings.userName || 'User';

    var userDesc = state.settings.userDescription || '';
    if (userDesc && userDesc.trim()) {
        parts.push('User\'s Persona: ' + replacePlaceholders(userDesc.trim(), 'Assistant', userName));
    }

    if (isGroup) {
        var members = getGroupMembers(conv);
        var forcedSpeaker = null;
        if (focusSpeakerName) {
            var lowerFocus = String(focusSpeakerName).toLowerCase();
            var matched = members.find(function(m) {
                return m.character && String(m.character.name || '').toLowerCase() === lowerFocus;
            });
            if (matched) forcedSpeaker = matched.character;
        }
        forcedSpeaker = forcedSpeaker || conv._nextGroupSpeaker || getCurrentSpeakerCharacter(conv);
        parts.push('这是一个多角色群组对话。第二阶段选项必须尊重每个角色的独立性格、当前主要发言者，以及群聊中的关系动态。');
        if (conv.group && conv.group.scenarioOverride && conv.group.scenarioOverride.trim()) {
            parts.push(replacePlaceholders(conv.group.scenarioOverride, forcedSpeaker ? forcedSpeaker.name : 'Assistant', userName));
        }
        members.forEach(function(member, index) {
            var c = member.character || {};
            var charName = c.name || ('角色' + (index + 1));
            var charBlock = '=== ' + charName + ' ===\n';
            if (c.system_prompt) charBlock += 'System Prompt: ' + replacePlaceholders(c.system_prompt, charName, userName) + '\n\n';
            var postHistory = getEffectivePostHistoryInstructions(c, 'second');
            if (postHistory) charBlock += 'Post-History Instructions: ' + replacePlaceholders(postHistory, charName, userName) + '\n\n';
            if (c.personality) charBlock += 'Personality: ' + replacePlaceholders(c.personality, charName, userName) + '\n\n';
            if (c.scenario) charBlock += 'Scenario: ' + replacePlaceholders(c.scenario, charName, userName) + '\n\n';
            if (c.description) charBlock += 'Description: ' + replacePlaceholders(c.description, charName, userName) + '\n\n';
            if (c.mes_example) charBlock += 'Example Dialogues:\n' + replacePlaceholders(c.mes_example, charName, userName) + '\n\n';
            parts.push(charBlock.trim());
        });
        if (forcedSpeaker && forcedSpeaker.name) {
            parts.push('本轮正文的主要发言者/叙事焦点：' + forcedSpeaker.name);
        }
    } else {
        var character = conv.character;
        var charName = character ? character.name : 'Assistant';
        if (character) {
            var charInfo = [];
            if (character.system_prompt) charInfo.push('System Prompt: ' + replacePlaceholders(character.system_prompt, charName, userName));
            var postHistory = getEffectivePostHistoryInstructions(character, 'second');
            if (postHistory) charInfo.push('Post-History Instructions: ' + replacePlaceholders(postHistory, charName, userName));
            if (character.personality) charInfo.push('Personality: ' + replacePlaceholders(character.personality, charName, userName));
            if (character.scenario) charInfo.push('Scenario: ' + replacePlaceholders(character.scenario, charName, userName));
            if (character.description) charInfo.push('Description: ' + replacePlaceholders(character.description, charName, userName));
            if (character.mes_example) charInfo.push('Example Dialogues:\n' + replacePlaceholders(character.mes_example, charName, userName));
            if (charInfo.length > 0) parts.push(charInfo.join('\n\n'));
        }
    }

    if (worldInfoByPos) {
        var currentChar = isGroup ? (forcedSpeaker || conv._nextGroupSpeaker || getCurrentSpeakerCharacter(conv)) : conv.character;
        var activeCharName = currentChar ? currentChar.name : (conv.character ? conv.character.name : 'Assistant');
        parts = injectWorldInfoIntoSystem(parts, worldInfoByPos, activeCharName, userName);
    }

    return parts.join('\n\n').trim();
}
