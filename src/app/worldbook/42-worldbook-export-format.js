/**
 * 新手导读（文件：42-worldbook-export-format.js）
 *
 * 负责什么：这是“角色与世界书数据模型”中的“世界书、导出、格式”部分。
 * 在程序中的位置：它负责世界书的创建、导入、导出、格式转换和注册。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：内部格式与 SillyTavern 格式字段不同，转换时不能丢失扩展字段。
 */
// ==================== World Book Export Format Facade ====================
// SillyTavern entry mapping and character_book export live in:
// - 42-worldbook-st-export-format.js
// - 42-worldbook-character-book-export.js
