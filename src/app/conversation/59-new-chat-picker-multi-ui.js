/**
 * 新手导读（文件：59-new-chat-picker-multi-ui.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、多选、界面”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Multi-select UI ====================
// Split into session, controls, and confirm bar helper chunks.
