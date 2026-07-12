/**
 * 新手导读（文件：40-character-prompt-worldbook.js）
 *
 * 负责什么：这是“角色卡导入”中的“角色、提示词、世界书”部分。
 * 在程序中的位置：它解析 PNG 或 JSON 角色卡，把角色设定和角色世界书转换成内部格式。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：外部文件不可信；读取字段时要允许缺失值并避免直接执行其中的内容。
 */
// ==================== Character Prompt / World Book Helpers ====================
// Split into card import, embedded book import, PNG extraction, and prompt helper chunks.
