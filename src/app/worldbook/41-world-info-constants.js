/**
 * 新手导读（文件：41-world-info-constants.js）
 *
 * 负责什么：这是“提示词与世界书注入”中的“世界书、信息、常量”部分。
 * 在程序中的位置：它把角色设定、聊天历史、总结、世界书和二段生成要求组装成模型消息。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：消息顺序会直接改变模型回复；修改前先确认每段内容应位于 system、user 还是 assistant。
 */
// ==================== World Info Constants ====================
var WI_POS = {
    BEFORE_CHAR: 0, AFTER_CHAR: 1,
    BEFORE_EX: 2, AFTER_EX: 3,
    TOP_AN: 4, BOTTOM_AN: 5,
    AT_DEPTH: 6, OUTLET: 7
};
var WI_ROLE = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };
