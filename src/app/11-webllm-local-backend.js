/**
 * 新手导读（文件：11-webllm-local-backend.js）
 *
 * 负责什么：这是“浏览器能力与本地模型”中的“浏览器本地大模型、本地、存储后端”部分。
 * 在程序中的位置：它在设置或生成流程中检测设备、准备 WebLLM，并把状态交给界面层。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：设备能力是异步获得的；修改时要同时考虑成功、失败和用户取消。
 */
// ==================== WebLLM Local Backend State ====================
// Keep this chunk side-effect light. The WebLLM engine is created only after user confirmation.
let webllmEngine = null;
let webllmCurrentModel = null;

const WEBLLM_MODEL_INFO = {
    'Llama-3.2-1B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-1B', sizeMB: 850 },
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-3B', sizeMB: 2100 }
};
