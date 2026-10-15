/**
 * 新手导读（文件：41-world-info-injection.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“世界书、信息、注入”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：主要从 `injectWorldInfoIntoSystem(systemParts, wiByPos, charName, userName)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// ==================== World Info Prompt Injection ====================
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
