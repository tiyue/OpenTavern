/**
 * 新手导读（文件：71-event-chat-bindings.js）
 *
 * 负责什么：这是“页面事件绑定”中的“事件、聊天、事件绑定”部分。
 * 在程序中的位置：它把按钮、输入框、快捷键和侧边栏操作连接到对应业务函数。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：绑定前要确认元素存在；动态创建的元素通常需要事件委托。
 */
// ==================== Chat Event Bindings Facade ====================
// Chat composer and message action bindings live in:
// - 71-event-chat-composer-bindings.js
// - 71-event-message-action-bindings.js
