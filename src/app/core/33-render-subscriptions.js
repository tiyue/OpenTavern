/**
 * 新手导读（文件：33-render-subscriptions.js）
 *
 * 负责什么：这是“消息完成与界面刷新”中的“渲染、订阅”部分。
 * 在程序中的位置：它在回复完成后更新消息区域，并用订阅把状态变化传给各界面。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：持久化状态与刷新页面的先后顺序会影响用户是否看到最新消息。
 */
// ==================== Render Subscriptions ====================
// store 变更键 → 需要刷新的区域。真正执行渲染的区域在一个 tick 内只跑一次，
// 因此 ['conversations','conversationOrder','activeConvId'] 这类同一批变更不再重复渲染同一区域。
var renderSubscriptions = {
    'conversations': ['conversationList'],
    'conversationOrder': ['conversationList'],
    'activeConvId': ['conversationList', 'messages', 'characterCard', 'topBar', 'worldInfoWarning'],
    'isGenerating': ['inputState'],
    'settings': ['inputState', 'topBar'],
    'worldInfo': ['worldInfoWarning']
};

var renderRegionHandlers = {
    'conversationList': function() { renderConversationListOnly(); },
    'messages': function() { renderMessagesOnly(); },
    'characterCard': function() { renderCharacterCard(); },
    'topBar': function() { renderTopBar(); },
    'worldInfoWarning': function() { renderWorldInfoBudgetWarning(); }
};

// 状态控件不属于渲染区域：保持同步且每次通知都执行，确保停止/发送按钮状态即时更新。
var controlRegionHandlers = {
    'inputState': function() { updateInputState(); }
};

// 同步状态修改完成后再绘制最终值，避免“首个通知已绘制”导致同一批后续变化丢失。
var pendingRenderRegions = new Set();
var renderRegionsScheduled = false;

function flushPendingRenderRegions() {
    var regions = pendingRenderRegions;
    pendingRenderRegions = new Set();
    renderRegionsScheduled = false;
    regions.forEach(function(region) { runRenderRegion(region, renderRegionHandlers[region]); });
}

function queueRenderRegion(region) {
    pendingRenderRegions.add(region);
    if (renderRegionsScheduled) return;
    renderRegionsScheduled = true;
    Promise.resolve().then(flushPendingRenderRegions);
}

function runRenderRegion(region, handler) {
    try {
        handler();
    } catch (e) {
        console.error('Render error for region:', region, e);
    }
}

appStore.subscribe(function(changedKeys) {
    if (typeof pruneCardRuntimeInstances === 'function') pruneCardRuntimeInstances();
    changedKeys.forEach(function(key) {
        var regions = renderSubscriptions[key];
        if (!regions) return;
        regions.forEach(function(region) {
            var controlHandler = controlRegionHandlers[region];
            if (controlHandler) {
                runRenderRegion(region, controlHandler);
                return;
            }
            var handler = renderRegionHandlers[region];
            if (!handler) return;
            queueRenderRegion(region);
        });
    });
});
