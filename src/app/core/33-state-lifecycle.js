/**
 * 新手导读（文件：33-state-lifecycle.js）
 *
 * 负责什么：这是“消息完成与界面刷新”中的“状态、生命周期”部分。
 * 在程序中的位置：它在回复完成后更新消息区域，并用订阅把状态变化传给各界面。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：持久化状态与刷新页面的先后顺序会影响用户是否看到最新消息。
 */
// ==================== State Lifecycle ====================
// Split into render shortcuts, final message append UI, and render subscriptions.
