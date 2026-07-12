/**
 * 新手导读（文件：41-world-info-extension-fields.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“世界书、信息、扩展字段、字段”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `promoteWorldInfoExtensionFields(e)`、`ensureWorldInfoEntryShape(e)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
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
