/**
 * 新手导读（文件：63-conversation-import-helpers.js）
 *
 * 负责什么：这是“会话导入导出”中的“会话、导入、辅助函数”部分。
 * 在程序中的位置：它把聊天记录转换成文件，或把外部记录合并为内部会话。
 * 从哪里开始看：主要从 `buildConversationImportSuccessMessage(imported, skipped)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：导入内容可能不完整或重复，必须先规范化再写入现有状态。
 */
// ==================== Conversation Import Helpers ====================
function buildConversationImportSuccessMessage(imported, skipped) {
    var msg = t('import_conv_success') + imported + t('import_conv_success_suffix');
    if (skipped > 0) msg += ' ' + skipped + t('import_conv_duplicate');
    return msg;
}
