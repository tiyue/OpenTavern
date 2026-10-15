/**
 * 新手导读（文件：12-i18n-runtime.js）
 *
 * 负责什么：这是“多语言系统”中的“多语言、运行流程”部分。
 * 在程序中的位置：它把界面使用的语言键映射成中文、英文等显示文本。
 * 从哪里开始看：主要从 `t(key)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新增语言键时应在各语言文件保持一致，缺失键会退回原始键名。
 */
// ==================== i18n Runtime Helpers ====================
function t(key) {
    var lang = state.settings.lang || 'zh-CN';
    var dict = i18n[lang];
    if (!dict) dict = i18n['en'];
    return dict[key] !== undefined ? dict[key] : (i18n['en'][key] || key);
}
