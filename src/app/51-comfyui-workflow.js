/**
 * 新手导读（文件：51-comfyui-workflow.js）
 *
 * 负责什么：这是“ComfyUI 绘图集成”中的“ComfyUI 绘图、工作流”部分。
 * 在程序中的位置：它填写工作流、请求图片生成，并把生成结果添加到聊天消息。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：工作流节点来自外部 JSON，查找节点时要保留缺失和格式错误处理。
 */
// ==================== ComfyUI Workflow Facade ====================
// Workflow cloning, prompt text, prompt application, and output lookup live in:
// - 51-comfyui-workflow-clone.js
// - 51-comfyui-prompt-text.js
// - 51-comfyui-workflow-apply.js
// - 51-comfyui-output-finder.js
