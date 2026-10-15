/**
 * 新手导读（文件：60-library-my-card-order.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、顺序”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getAllMyCardKeys(无参数)`、`normalizeMyCardOrder(order)`、`getMyCardOrder(无参数)`、`getOrderedMyLibraryCharacters(无参数)`、`removeMyCardKeyFromOrder(key)`、`bindMyCardReorderEvents(cardEl)`，以及另外 30 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== My Library Card Ordering ====================
var MY_CARD_REORDER_HOLD_MS = 380;
var MY_CARD_REORDER_MOVE_CANCEL_PX = 18;
var MY_CARD_REORDER_EDGE_SCROLL_PX = 68;
var MY_CARD_REORDER_EDGE_SCROLL_STEP = 18;
var myCardReorderState = null;
var myCardReorderSuppressClickUntil = 0;

function getAllMyCardKeys() {
    return Object.keys(state.characters || {});
}

function normalizeMyCardOrder(order) {
    var known = new Set(getAllMyCardKeys());
    var seen = new Set();
    var result = [];

    (Array.isArray(order) ? order : []).forEach(function(key) {
        key = String(key || '').trim().toLowerCase();
        if (known.has(key) && !seen.has(key)) {
            seen.add(key);
            result.push(key);
        }
    });

    getAllMyCardKeys().forEach(function(key) {
        if (!seen.has(key)) {
            seen.add(key);
            result.push(key);
        }
    });

    return result;
}

function getMyCardOrder() {
    return normalizeMyCardOrder(state.settings && state.settings.myCardOrder);
}

function getOrderedMyLibraryCharacters() {
    var characters = state.characters || {};
    return getMyCardOrder().map(function(key) {
        return characters[key];
    }).filter(Boolean);
}

function removeMyCardKeyFromOrder(key) {
    if (!state.settings || !Array.isArray(state.settings.myCardOrder)) return;
    state.settings.myCardOrder = state.settings.myCardOrder.filter(function(item) {
        return item !== key;
    });
}
