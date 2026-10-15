/**
 * 新手导读（文件：58-summary-manager-ui.js）
 *
 * 负责什么：这是“总结管理器界面”中的“总结、管理器、界面”部分。
 * 在程序中的位置：它让用户选择消息范围、查看已有总结并启动手动总结。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：范围显示使用人类可读编号，而内部数组从 0 开始，转换时要防止差一位。
 */
// ==================== Summary Manager Workflow UI ====================
// Split into range, generation, and modal open helper chunks.
