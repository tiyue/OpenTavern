/**
 * 新手导读（文件：11-webllm-download-ui.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、下载、界面”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：主要从 `showWebLLMConfirmDialog(onContinue, onCancel)`、`showWebLLMConfirmForModel(targetModelId, isModelSwitch, onContinue, onCancel)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ===== WebLLM confirmation dialog flow =====
var _prevWebLLMSelectValueForConfirm = 'remote-api';

function showWebLLMConfirmDialog(onContinue, onCancel) {
    showWebLLMConfirmForModel(null, false, onContinue, onCancel);
}

function showWebLLMConfirmForModel(targetModelId, isModelSwitch, onContinue, onCancel) {
    var elements = getWebLLMConfirmModalElements();
    var modelId = getWebLLMConfirmModelId(targetModelId);

    if (!elements.modal) {
        var info = getWebLLMModelInfo(modelId);
        showGlassConfirm(buildWebLLMFallbackConfirmMessage(formatWebLLMModelSize(info.sizeMB)), {
            title: t('webllm_confirm_title') || '启用浏览器本地模型'
        }).then(function(ok) {
            if (ok) {
                if (onContinue) onContinue(modelId);
            } else if (onCancel) {
                onCancel();
            }
        });
        return;
    }

    renderWebLLMConfirmModal(elements, modelId, isModelSwitch);

    function cleanup() {
        cleanupWebLLMConfirmModal(elements.modal, elements.cancelBtn, elements.continueBtn, elements.backdrop);
    }
    bindWebLLMConfirmModalHandlers(elements, cleanup, modelId, onContinue, onCancel);

    if (!isModelSwitch) {
        wireWebLLMChoiceButtons(cleanup, onContinue);
    }
}
