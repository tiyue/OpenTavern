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
