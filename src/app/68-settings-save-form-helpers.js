/**
 * 新手导读（文件：68-settings-save-form-helpers.js）
 *
 * 负责什么：这是“设置界面”中的“设置、保存、表单、辅助函数”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `readTrimmedControlValue(control)`、`readControlValue(control)`、`readControlValueOr(control, fallback)`、`readTrimmedControlValueOr(control, fallback)`、`readCheckboxControlValue(control, fallback)`、`readIntegerControlValue(control, fallback)`，以及另外 2 个内部步骤 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// ==================== Settings Save Form Helpers ====================
function readTrimmedControlValue(control) {
    return control ? String(control.value || '').trim() : '';
}

function readControlValue(control) {
    return control ? String(control.value || '') : '';
}

function readControlValueOr(control, fallback) {
    return readControlValue(control) || fallback;
}

function readTrimmedControlValueOr(control, fallback) {
    return readTrimmedControlValue(control) || fallback;
}

function readCheckboxControlValue(control, fallback) {
    return control ? !!control.checked : !!fallback;
}

function readIntegerControlValue(control, fallback) {
    return parseInt(control.value) || fallback;
}

function readFloatControlValue(control, fallback) {
    return parseFloat(control.value) || fallback;
}

function readFiniteFloatControlValue(control, fallback) {
    var value = parseFloat(control.value);
    return Number.isFinite(value) ? value : fallback;
}
