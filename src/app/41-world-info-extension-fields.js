// ==================== World Info Extension Field Helpers ====================
function promoteWorldInfoExtensionFields(e) {
    if (!e.extensions || typeof e.extensions !== 'object') return e;
    var ext = e.extensions;

    if (ext.scan_depth != null && e.scanDepth == null) e.scanDepth = ext.scan_depth;
    if (ext.depth != null && e.depth == null) e.depth = ext.depth;
    if (ext.role != null && e.role == null) e.role = ext.role;
    if (ext.probability != null && e.probability == null) e.probability = ext.probability;
    if (ext.useProbability != null && e.useProbability == null) e.useProbability = ext.useProbability;
    if (ext.selectiveLogic != null && e.selectiveLogic == null) e.selectiveLogic = ext.selectiveLogic;

    if (ext.sticky != null && e.sticky == null) e.sticky = ext.sticky;
    if (ext.cooldown != null && e.cooldown == null) e.cooldown = ext.cooldown;
    if (ext.delay != null && e.delay == null) e.delay = ext.delay;

    if (ext.exclude_recursion != null && e.excludeRecursion == null) e.excludeRecursion = ext.exclude_recursion;
    if (ext.prevent_recursion != null && e.preventRecursion == null) e.preventRecursion = ext.prevent_recursion;
    if (ext.delay_until_recursion != null && e.delayUntilRecursion == null) e.delayUntilRecursion = ext.delay_until_recursion;

    if (ext.outlet_name != null && e.outletName == null) e.outletName = ext.outlet_name;
    if (ext.group != null && e.group == null) e.group = ext.group;
    if (ext.group_override != null && e.groupOverride == null) e.groupOverride = ext.group_override;
    if (ext.group_weight != null && e.groupWeight == null) e.groupWeight = ext.group_weight;
    if (ext.use_group_scoring != null && e.useGroupScoring == null) e.useGroupScoring = ext.use_group_scoring;

    if (ext.automation_id != null && e.automationId == null) e.automationId = ext.automation_id;
    if (ext.triggers && !e.triggers) e.triggers = ext.triggers;
    if (ext.ignore_budget != null && e.ignoreBudget == null) e.ignoreBudget = ext.ignore_budget;

    if (ext.case_sensitive != null && e.caseSensitive == null) e.caseSensitive = ext.case_sensitive;
    if (ext.match_whole_words != null && e.matchWholeWords == null) e.matchWholeWords = ext.match_whole_words;
    if (ext.match_character_description != null) e.matchCharacterDescription = ext.match_character_description;
    if (ext.match_character_personality != null) e.matchCharacterPersonality = ext.match_character_personality;
    if (ext.match_scenario != null) e.matchScenario = ext.match_scenario;
    if (ext.match_persona_description != null) e.matchPersonaDescription = ext.match_persona_description;
    if (ext.match_character_depth_prompt != null) e.matchCharacterDepthPrompt = ext.match_character_depth_prompt;
    if (ext.match_creator_notes != null) e.matchCreatorNotes = ext.match_creator_notes;

    return e;
}

function ensureWorldInfoEntryShape(e) {
    if (!Array.isArray(e.key)) e.key = [];
    if (!Array.isArray(e.keysecondary)) e.keysecondary = [];
    if (!Array.isArray(e.triggers)) e.triggers = [];
    if (!e.characterFilter) e.characterFilter = { isExclude: false, names: [], tags: [] };

    if (!e.extensions) e.extensions = {};
    e.extensions.position = e.position;
    if (e.depth != null) e.extensions.depth = e.depth;
    if (e.role != null) e.extensions.role = e.role;

    return e;
}
