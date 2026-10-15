/**
 * 新手导读（文件：21-local-resource-ui.js）
 *
 * 负责什么：这是“本地优先资源与后台更新”中的“离线、资源、界面”部分。
 * 在程序中的位置：它在设置弹窗的存储二级设置内渲染本地资源小节的只读状态与操作入口，
 * 只通过 LocalResourceManager 读取真实缓存状态，并只更新本小节文本，不触发聊天或消息重绘。
 * 从哪里开始看：主要从 `bindSettingsLocalResourceControls(无参数)`、`renderLocalResourceStatus(无参数)` 开始阅读。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：状态回调可能在任意时刻触发，必须只改本小节元素；不要调用 renderAll/renderMessages，
 * 也不要写用户存储。
 *
 * 本小节使用的元素 id（仅在 settings/workspace.html 的离线小节内）：
 * localResourceSection、localResourceSummary、localResourceCore、localResourcePublic、
 * localResourceUpdate、localResourceStatus、localResourceCheckBtn、localResourcePrepareBtn、
 * localResourceCleanBtn、localResourceApplyBtn、localResourcePrivate、localResourcePrivatePrepareBtn。
 */
// ==================== Local Resource Settings UI ====================
var localResourceUiBound = false;
var localResourceUiUnsubscribe = null;
var privateMediaUiUnsubscribe = null;

function formatLocalResourceBytes(bytes) {
    var value = Number(bytes) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KiB';
    if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MiB';
    return (value / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
}

// 主文案里不出现完整 24 位版本号，只显示足以分辨的前缀。
function shortReleaseId(releaseId) {
    var text = String(releaseId || '');
    return /^[0-9a-f]{24}$/.test(text) ? text.slice(0, 8) : text;
}

function setLocalResourceText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setLocalResourceStatusText(value) {
    setLocalResourceText('localResourceStatus', value);
}

function describeLocalResourceCore(status) {
    var core = status.core || {};
    if (!status.supported) return '本来源无受控离线缓存，已准备内容无法保证断网重开。';
    if (core.state === 'preparing') return '核心版本下载中 ' + core.ready + '/' + core.total + '（' + formatLocalResourceBytes(core.bytes) + '）';
    if (core.state === 'ready') return '核心版本已就绪 ' + core.total + ' 个文件（' + formatLocalResourceBytes(core.bytes || core.bytesTotal) + '），可在断网时重新打开。';
    if (core.state === 'error') return '核心版本未完成：' + (status.lastError || '校验失败');
    return '核心版本尚未准备（' + core.total + ' 个文件）。';
}

function describeLocalResourcePublic(status) {
    var pub = status.public || {};
    var line = '当前版本公共资料已准备 ' + pub.ready + '/' + pub.total + '（' + formatLocalResourceBytes(pub.bytes) + ' / ' + formatLocalResourceBytes(pub.bytesTotal) + '）';
    if (pub.running) line += '，后台准备中';
    else if (pub.stopped) line += '，已暂停';
    return line;
}

function describeLocalResourceUpdate(status) {
    if (!status.supported) return '本来源无受控离线缓存；本地操作照常可用，模型请求仍需供应商网络可达。';
    if (status.update && status.update.available) return '核心更新已就绪（' + shortReleaseId(status.update.releaseId) + '），可切换。';
    if (status.activeReleaseId) return '当前版本 ' + shortReleaseId(status.activeReleaseId) + '，未发现待切换更新。';
    return '尚未准备完整核心版本。';
}

function describePrivateMediaStatus(status) {
    if (!status) return '本地图片状态未知。';
    var text = status.text ? String(status.text) : ('本地图片 ' + (Number(status.ready) || 0) + '/' + (Number(status.total) || 0));
    if (status.preparing) text += '，准备中';
    else if (status.failed) text += '，失败：' + (status.failureMessage || '未知错误');
    else if (status.pending) text += '，待准备';
    return text;
}

// 私有图片状态只在渲染时读取，绝不在这里触发任何下载。
function renderPrivateMediaStatus() {
    var line = document.getElementById('localResourcePrivate');
    var button = document.getElementById('localResourcePrivatePrepareBtn');
    var available = typeof PrivateMediaLocal !== 'undefined' && !!PrivateMediaLocal && typeof PrivateMediaLocal.getStatus === 'function';
    if (line) line.hidden = !available;
    if (button) button.hidden = !available;
    if (!available) return;
    var status = null;
    try { status = PrivateMediaLocal.getStatus(); } catch (error) { status = null; }
    setLocalResourceText('localResourcePrivate', describePrivateMediaStatus(status));
    if (button) button.disabled = !!(status && status.preparing);
}

function renderLocalResourceStatus() {
    if (typeof LocalResourceManager === 'undefined' || !LocalResourceManager) return;
    var status;
    try {
        status = LocalResourceManager.getStatus();
    } catch (error) {
        return;
    }
    setLocalResourceText('localResourceCore', describeLocalResourceCore(status));
    setLocalResourceText('localResourcePublic', describeLocalResourcePublic(status));
    setLocalResourceText('localResourceUpdate', describeLocalResourceUpdate(status));
    setLocalResourceText('localResourceSummary', status.supported
        ? '应用与资料缓存在本机浏览器缓存中；断网站点不影响已准备内容与本地操作，模型请求仍需供应商网络可达。'
        : '当前来源不支持受控离线缓存，已准备内容无法保证断网重开；本地操作照常可用，模型请求仍需供应商网络可达。');
    var applyBtn = document.getElementById('localResourceApplyBtn');
    if (applyBtn) applyBtn.disabled = !(status.update && status.update.available);
    var prepareBtn = document.getElementById('localResourcePrepareBtn');
    if (prepareBtn) prepareBtn.disabled = !status.supported || !!(status.public && status.public.running);
    renderPrivateMediaStatus();
}

function setLocalResourceBusy(busy) {
    ['localResourceCheckBtn', 'localResourcePrepareBtn', 'localResourceCleanBtn'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = !!busy;
    });
}

function bindLocalResourceAction(id, action, successText) {
    var button = document.getElementById(id);
    if (!button) return;
    button.onclick = async function() {
        setLocalResourceBusy(true);
        setLocalResourceStatusText('处理中…');
        try {
            var result = await action();
            var message = typeof successText === 'function' ? successText(result) : successText;
            setLocalResourceStatusText(result === false ? '未能完成，请查看上方状态。' : message);
        } catch (error) {
            setLocalResourceStatusText('失败：' + ((error && error.message) || error));
        } finally {
            setLocalResourceBusy(false);
            renderLocalResourceStatus();
        }
    };
}

// 公共资料按真实结果汇报：只有全部就绪才算完成，暂停/失败要如实说明已完成数量。
function describePublicPrepareResult() {
    var status = LocalResourceManager.getStatus();
    var pub = status.public || {};
    if (pub.state === 'ready' && pub.total > 0 && pub.ready >= pub.total) return '公共资料已全部准备。';
    return '公共资料准备未完成（' + (Number(pub.ready) || 0) + '/' + (Number(pub.total) || 0) + '），可稍后继续。';
}

function bindSettingsLocalResourceControls() {
    if (typeof LocalResourceManager === 'undefined' || !LocalResourceManager) return;
    renderLocalResourceStatus();
    if (!localResourceUiBound) {
        localResourceUiBound = true;
        localResourceUiUnsubscribe = LocalResourceManager.subscribe(function() { renderLocalResourceStatus(); });
        bindLocalResourceAction('localResourceCheckBtn', function() { return LocalResourceManager.checkForUpdates(); }, '已检查更新。');
        bindLocalResourceAction('localResourcePrepareBtn', function() { return LocalResourceManager.preparePublic(); }, describePublicPrepareResult);
        bindLocalResourceAction('localResourceCleanBtn', function() { return confirmLocalResourceClean(); }, '已清理可重新下载的资源缓存。');
        bindLocalResourceAction('localResourceApplyBtn', function() { return applyLocalResourceUpdate(); }, '版本已切换，正在重新载入…');
        var privateButton = document.getElementById('localResourcePrivatePrepareBtn');
        if (privateButton) {
            privateButton.onclick = async function() {
                if (typeof PrivateMediaLocal === 'undefined' || !PrivateMediaLocal || typeof PrivateMediaLocal.prepareAll !== 'function') return;
                privateButton.disabled = true;
                try {
                    await PrivateMediaLocal.prepareAll();
                } catch (error) {
                    setLocalResourceStatusText('本地图片准备失败：' + ((error && error.message) || error));
                } finally {
                    renderPrivateMediaStatus();
                }
            };
        }
        if (typeof PrivateMediaLocal !== 'undefined' && PrivateMediaLocal && typeof PrivateMediaLocal.subscribe === 'function') {
            privateMediaUiUnsubscribe = PrivateMediaLocal.subscribe(function() { renderPrivateMediaStatus(); });
        }
    }
    renderPrivateMediaStatus();
    LocalResourceManager.refreshStatus().catch(function() {});
}

async function confirmLocalResourceClean() {
    if (typeof showGlassConfirm === 'function') {
        var ok = await showGlassConfirm('清理可重新下载的应用缓存？只会删除非当前版本的应用下载缓存与公共资料缓存，不触碰聊天、设置或已导入资料。', {
            title: '清理下载缓存', danger: false, okText: '清理'
        });
        if (!ok) return false;
    }
    return LocalResourceManager.clearDownloads();
}

async function applyLocalResourceUpdate() {
    await LocalResourceManager.applyUpdate();
    if (typeof location !== 'undefined' && location.reload) location.reload();
    return true;
}
