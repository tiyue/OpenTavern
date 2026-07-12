/**
 * 新手导读（文件：11-webllm-storage-preflight.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、存储、使用前检查”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `preflightWebLLMStorageQuota(info)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== WebLLM Storage Preflight ====================
async function preflightWebLLMStorageQuota(info) {
    try {
        const needMB = info.sizeMB || 900;
        const sInfo = await StorageService.getStorageInfo();
        if (sInfo && sInfo.quota != null) {
            const currentUsed = (sInfo.originUsed && sInfo.originUsed > 0)
                ? sInfo.originUsed
                : ((sInfo.totalUsed != null) ? sInfo.totalUsed : (sInfo.used || 0));
            const freeEst = sInfo.quota - currentUsed;
            if (freeEst < needMB * 1024 * 1024 * 1.6) {
                const ok = await showGlassConfirm(`\u5b58\u50a8\u7a7a\u95f4\u53ef\u80fd\u4e0d\u8db3\uff08\u6a21\u578b\u7ea6 ${needMB}MB\uff09\u3002\u5efa\u8bae\u5148\u6e05\u7406 WebLLM \u7f13\u5b58\u6216\u5bfc\u51fa\u5907\u4efd\u518d\u7ee7\u7eed\u3002\n\u4ecd\u8981\u7ee7\u7eed\u5417\uff1f`, { title: '\u5b58\u50a8\u7a7a\u95f4\u63d0\u9192' });
                if (!ok) {
                    if (state && state.settings) state.settings.inferenceBackend = 'remote-api';
                    if (typeof persistState === 'function') await persistState(true);
                    return false;
                }
            }
        }
    } catch (_) {}
    return true;
}
