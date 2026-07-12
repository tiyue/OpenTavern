/**
 * 新手导读（文件：44-worldbook-activation.js）
 *
 * 负责什么：这是“世界书匹配引擎”中的“世界书、激活规则”部分。
 * 在程序中的位置：它扫描最近聊天文本，按关键词、分组、预算和时效规则选出要注入的条目。
 * 从哪里开始看：主要从 `getActivatedWorldInfo(conv)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：匹配顺序和预算共同决定最终结果；看似多余的去重步骤用于防止重复注入。
 */
// ==================== World Book Activation Engine ====================
/**
 * 根据当前聊天内容选出本轮应加入提示词的世界书条目。
 *
 * @param {Object} conv - 当前会话，包含消息、角色、关联世界书和运行时缓存。
 * @returns {{entries: Array, byPosition: Object, outlets: Object}} 已激活条目及其位置分组。
 *
 * 处理管线：收集候选世界书 -> 尝试命中缓存 -> 过滤禁用项 -> 关键词直接匹配 ->
 * 递归扩展 -> 去重 -> 解决互斥分组 -> 按 order 排序 -> 应用定时效果与 Token 预算 ->
 * 按提示词位置分组。任何一步次序变化都可能让最终注入内容不同。
 *
 * 缓存依赖聊天和世界书内容生成的 key；只有 key 完全相同时才复用结果，避免每次渲染都重扫文本。
 */
function getActivatedWorldInfo(conv) {
    var entries = collectWorldInfoActivationEntries(conv);
    if (entries.length === 0) return { entries: [], byPosition: {} };

    var wi = buildCombinedWorldInfo(entries);
    var cacheKey = buildWorldInfoActivationCacheKey(conv, wi);
    if (conv._wiCache && conv._wiCache.key === cacheKey) {
        return conv._wiCache.result;
    }

    var all = getEnabledWorldInfoEntries(wi);
    if (all.length === 0) return { entries: [], byPosition: {} };

    var charName = conv.character ? conv.character.name : '';
    var charTags = conv.character ? (conv.character.tags || []) : [];

    var activated = activateDirectWorldInfoEntries(all, conv, charName, charTags);
    activated = expandRecursiveWorldInfoEntries(activated, all, charName, charTags);
    activated = dedupeWorldInfoEntries(activated);
    activated = resolveWorldInfoInclusionGroups(activated);
    activated.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });

    activated = processTimedEffects(conv, activated);
    activated = applyWorldInfoBudgetWithWarning(activated);
    activated.forEach(function(e) { delete e.isRecursive; });

    var grouped = groupActivatedWorldInfoByPosition(activated);
    var result = {
        entries: activated,
        byPosition: grouped.byPosition,
        outlets: grouped.outlets
    };

    cacheActivatedWorldInfoResult(conv, cacheKey, result);
    return result;
}
