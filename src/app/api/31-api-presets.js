/**
 * 新手导读（文件：31-api-presets.js）
 *
 * 负责什么：这是“模型 API 连接”中的“模型接口、预设”部分。
 * 在程序中的位置：它整理接口地址、探测模型列表，并向用户报告连接测试结果。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：不同服务的接口格式不完全相同，修改时要保留 OpenAI 与 Ollama 兼容分支。
 */
// ==================== API Presets (常用接口地址) ====================
(function() {
    var MAIN_PRESETS = {
        'deepseek':    { endpoint: 'https://api.deepseek.com',            model: 'deepseek-v4-flash' }
    };

    var SUMMARIZE_PRESETS = {
        'deepseek':    { endpoint: 'https://api.deepseek.com',            model: 'deepseek-v4-flash' }
    };

    window.applyMainApiPreset = function(key) {
        var p = MAIN_PRESETS[key];
        if (!p) return;
        var ep = document.getElementById('apiEndpoint');
        var md = document.getElementById('modelName');
        if (ep) ep.value = p.endpoint;
        if (md && p.model) {
            // 只在用户还没手动改过或为空时建议填充，避免覆盖用户自定义模型
            if (!md.value || md.value === 'gpt-4o' || md.value === 'gpt-4o-mini') {
                md.value = p.model;
            }
        }
    };

    window.applySummarizeApiPreset = function(key) {
        var p = SUMMARIZE_PRESETS[key];
        if (!p) return;
        var ep = document.getElementById('summarizeApiEndpoint');
        var md = document.getElementById('summarizeModel');
        if (ep) ep.value = p.endpoint;
        if (md && p.model) {
            md.value = p.model;
        }
    };
})();
