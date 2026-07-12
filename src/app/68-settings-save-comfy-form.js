/**
 * 新手导读（文件：68-settings-save-comfy-form.js）
 *
 * 负责什么：这是“设置界面”中的“设置、保存、ComfyUI 绘图、表单”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `readComfySettingsFromForm(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// ==================== Settings Save ComfyUI Form ====================
function readComfySettingsFromForm() {
    ensureComfySettings();
    if (dom.comfyEnabled) state.settings.comfyEnabled = readCheckboxControlValue(dom.comfyEnabled, false);
    if (dom.comfyServer) state.settings.comfyServer = normalizeComfyServer(readControlValue(dom.comfyServer));
    if (dom.comfyPositiveNodeId) state.settings.comfyPositiveNodeId = readTrimmedControlValue(dom.comfyPositiveNodeId);
    if (dom.comfyNegativeNodeId) state.settings.comfyNegativeNodeId = readTrimmedControlValue(dom.comfyNegativeNodeId);
    if (dom.comfySeedNodeId) state.settings.comfySeedNodeId = readTrimmedControlValue(dom.comfySeedNodeId);
    if (dom.comfyNegativePrompt) state.settings.comfyNegativePrompt = readTrimmedControlValue(dom.comfyNegativePrompt);
    if (dom.comfyPromptTemplate) state.settings.comfyPromptTemplate = readTrimmedControlValueOr(dom.comfyPromptTemplate, defaultSettings().comfyPromptTemplate);
}
