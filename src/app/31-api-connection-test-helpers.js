/**
 * 新手导读（文件：31-api-connection-test-helpers.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、连接、测试、辅助函数”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
// API connection test helpers are split across:
// - 31-api-connection-test-config.js
// - 31-api-connection-endpoints.js
// - 31-api-connection-result-ui.js
// - 31-api-connection-response-helpers.js
