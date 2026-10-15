/**
 * 新手导读（文件：10-runtime-assets.js）
 *
 * 负责什么：这是“应用外壳与运行时资源”中的“运行时、资源、定位”部分。
 * 在程序中的位置：它把 HTML 注入的 window.__OT_RUNTIME__ 转成唯一明确的资源地址入口，
 * 供正则 Worker 同源后备与固定卡片依赖使用；没有版本快照信息时回退到旧相对地址。
 * 从哪里开始看：主要从 `getRuntimeConfig(无参数)`、`getRuntimeBasePath(无参数)`、`getRuntimeAssetUrl(relativePath)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：这里只做地址解析，不发起任何网络请求，也不缓存字节；不要在加载期访问用户数据。
 */
// ==================== Runtime Asset Resolver ====================
// 唯一明确的运行时资源定位入口。相对路径保留 assets/js/... 形状，使固定快照能按
// assets/offline/<releaseId>/assets/js/... 直接命中；缺省或缺快照时退回相对旧地址，
// 兼容源码级夹具、未重建的入口与普通 HTTP 无 Service Worker 的降级路径。
function getRuntimeConfig() {
    try {
        var config = window.__OT_RUNTIME__;
        return config && typeof config === 'object' ? config : null;
    } catch (error) {
        return null;
    }
}

function getRuntimeBasePath() {
    var config = getRuntimeConfig();
    if (config && typeof config.basePath === 'string' && config.basePath) {
        return config.basePath.replace(/\/+$/, '') + '/';
    }
    try {
        var pathname = (window.location && window.location.pathname) || '/';
        return pathname.slice(0, pathname.lastIndexOf('/') + 1) || '/';
    } catch (error) {
        return '/';
    }
}

function getRuntimeAssetUrl(relativePath) {
    var path = String(relativePath == null ? '' : relativePath).replace(/^\.?\//, '').replace(/\\/g, '/');
    if (!path) return '';
    var config = getRuntimeConfig();
    var snapshotBase = config && typeof config.snapshotBase === 'string' ? config.snapshotBase.trim() : '';
    if (snapshotBase) {
        return snapshotBase.replace(/\/+$/, '') + '/' + path;
    }
    return path;
}
