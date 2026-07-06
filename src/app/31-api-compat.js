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

// ==================== API 连接测试（新增） ====================
window.testMainApiConnection = function() {
    var epEl = document.getElementById('apiEndpoint');
    var keyEl = document.getElementById('apiKey');
    var modelEl = document.getElementById('modelName');
    var resultEl = document.getElementById('apiTestResult');

    var rawEndpoint = epEl ? epEl.value.trim() : '';
    var apiKey = keyEl ? keyEl.value.trim() : '';
    var model = modelEl ? modelEl.value.trim() || 'gpt-3.5-turbo' : 'gpt-3.5-turbo';

    if (!resultEl) return;

    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<span class="text-amber-400">' + t('api_test_testing') + '</span>';

    if (!rawEndpoint) {
        resultEl.innerHTML = '<div class="text-red-400">' + t('api_test_need_endpoint') + '</div>';
        return;
    }

    // 派生 models 测试地址（首选）
    function deriveModelsEndpoint(raw) {
        var u = String(raw || '').trim().replace(/\/+$/, '');
        u = u.replace(/\/chat\/completions$/i, '');
        // 如果已经是版本化路径（/v1 /v0 /openai/v1 等），直接加 /models
        if (/\/(v[0-9]+|openai\/v1|paas\/v[0-9]+)$/.test(u)) {
            return u + '/models';
        }
        // 否则补 /v1 再加 /models（DeepSeek 等无版本输入）
        if (!/\/v[0-9]/.test(u) && !u.includes('/paas/')) {
            u += '/v1';
        }
        return u + '/models';
    }

    var modelsUrl = deriveModelsEndpoint(rawEndpoint);
    var chatUrl = normalizeApiEndpoint(rawEndpoint); // 用于备选 chat 测试

    var TIMEOUT_MS = 15000;

    function buildErrorHtml(title, details, suggestions, testedUrls) {
        var html = '<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-300">';
        html += '<div class="font-semibold mb-1">' + title + '</div>';
        if (details) html += '<div class="text-red-200/90 mb-1 whitespace-pre-wrap">' + details + '</div>';
        if (testedUrls && testedUrls.length) {
            html += '<div class="text-[10px] text-red-300/70 mb-1">' + t('api_test_tested_urls_label') + '<br>' + testedUrls.map(function(x){return '• ' + x;}).join('<br>') + '</div>';
        }
        if (suggestions && suggestions.length) {
            html += '<div class="mt-1 text-amber-300/90"><div class="font-medium text-[10px] mb-0.5">' + t('api_test_suggest_title') + '</div><ul class="list-disc ml-4 text-[10px] leading-snug">';
            suggestions.forEach(function(s) { html += '<li>' + s + '</li>'; });
            html += '</ul></div>';
        }
        html += '</div>';
        return html;
    }

    function buildSuccessHtml(models) {
        var html = '<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-emerald-300">';
        html += '<div class="font-semibold">' + t('api_test_success_title') + '</div>';
        if (models && models.length > 0) {
            var shown = models.slice(0, 12);
            var total = models.length;
            var shownCount = shown.length;
            var listLabel;
            if (total > shownCount) {
                // e.g. "返回的模型列表（前 5 个 / 共 30 个）： " or English "Returned model list (first 5 of 30):"
                listLabel = t('api_test_models_prefix') + shownCount + t('api_test_models_total') + total + t('api_test_models_mid');
            } else {
                listLabel = t('api_test_models_prefix') + shownCount + t('api_test_models_mid');
            }
            html += '<div class="mt-1 text-emerald-200/90">' + listLabel + '</div>';
            html += '<div class="mt-0.5 text-xs text-emerald-100/80 font-mono break-all">' + shown.join(', ') + '</div>';
            if (total > 12) html += '<div class="text-[10px] text-emerald-300/60 mt-0.5">' + t('api_test_more_omitted') + '</div>';
        } else {
            html += '<div class="text-emerald-200/80 text-xs mt-1">' + t('api_test_models_empty_note') + '</div>';
        }
        html += '</div>';
        return html;
    }

    async function doFetchWithTimeout(url, options) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, TIMEOUT_MS);
        try {
            var resp = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
            clearTimeout(timer);
            return resp;
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    (async function runTest() {
        var tested = [];
        var modelsList = [];
        var modelsErrInfo = '';

        // ===== 首选测试：GET /v1/models =====
        try {
            tested.push('GET ' + modelsUrl);
            var headers = {};
            if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
            var resp = await doFetchWithTimeout(modelsUrl, { method: 'GET', headers: headers });

            if (resp.ok) {
                var data = await resp.json().catch(function(){ return {}; });
                if (data && Array.isArray(data.data)) {
                    modelsList = data.data.map(function(m){ return m && (m.id || m.name) || String(m); }).filter(Boolean);
                } else if (Array.isArray(data)) {
                    modelsList = data.map(function(m){ return m && (m.id || m.name) || String(m); }).filter(Boolean);
                }
                resultEl.innerHTML = buildSuccessHtml(modelsList);
                return; // 成功就结束，不再跑备选
            } else {
                // HTTP 错误
                var text = await resp.text().catch(function(){return '';});
                var errMsg = 'HTTP ' + resp.status;
                try {
                    var j = JSON.parse(text);
                    if (j.error && j.error.message) errMsg += ' — ' + j.error.message;
                    else if (j.message) errMsg += ' — ' + j.message;
                } catch (e) {
                    if (text) errMsg += ' — ' + text.slice(0, 300);
                }
                modelsErrInfo = errMsg;
            }
        } catch (e) {
            var secs = (TIMEOUT_MS / 1000);
            if (e.name === 'AbortError') {
                modelsErrInfo = t('api_test_timeout_msg').replace('{s}', secs);
            } else if (e instanceof TypeError) {
                modelsErrInfo = t('api_test_typeerror_prefix') + (e.message || 'Failed to fetch');
            } else {
                modelsErrInfo = (e.message || String(e));
            }
        }

        // ===== 失败时做备选/进阶测试：极简非流式 chat =====
        var chatResult = '';
        try {
            tested.push('POST ' + chatUrl + ' (stream:false)');
            var chatPayload = {
                model: model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 1,
                temperature: 0,
                stream: false
            };
            var chatHeaders = { 'Content-Type': 'application/json' };
            if (apiKey) chatHeaders['Authorization'] = 'Bearer ' + apiKey;

            var chatResp = await doFetchWithTimeout(chatUrl, {
                method: 'POST',
                headers: chatHeaders,
                body: JSON.stringify(chatPayload)
            });

            if (chatResp.ok) {
                var chatData = await chatResp.json().catch(function(){return {};});
                var hasChoice = chatData && chatData.choices && chatData.choices[0];
                var suffix = hasChoice ? t('api_test_fallback_success_choice') : t('api_test_fallback_success_ok');
                chatResult = t('api_test_fallback_success') + suffix;
            } else {
                var ctext = await chatResp.text().catch(function(){return '';});
                var cmsg = 'HTTP ' + chatResp.status;
                try {
                    var cj = JSON.parse(ctext);
                    if (cj.error && cj.error.message) cmsg += ' — ' + cj.error.message;
                } catch(e){}
                chatResult = t('api_test_fallback_failed_prefix') + cmsg;
            }
        } catch (e2) {
            var c2 = '';
            if (e2.name === 'AbortError') c2 = t('api_test_timeout_short');
            else if (e2 instanceof TypeError) c2 = t('api_test_typeerror_cors_note');
            else c2 = e2.message || String(e2);
            chatResult = t('api_test_fallback_failed_prefix') + c2;
        }

        // 构建失败报告
        var suggestions = [];
        var rawEpLower = rawEndpoint.toLowerCase();
        if (rawEpLower.includes('localhost') || rawEpLower.includes('127.0.0.1')) {
            suggestions.push(t('api_test_suggest_localhost'));
        }
        suggestions.push(t('api_test_suggest_cors'));
        suggestions.push(t('api_test_suggest_endpoint_path'));
        suggestions.push(t('api_test_suggest_apikey'));
        suggestions.push(t('api_test_suggest_stream'));
        suggestions.push(t('api_test_suggest_gateway'));

        var detail = t('api_test_models_failed_prefix') + (modelsErrInfo || t('api_test_unknown_error'));
        if (chatResult) detail += '\n' + chatResult;

        resultEl.innerHTML = buildErrorHtml(t('api_test_failed_title'), detail, suggestions, tested);
    })();
};

// 统一的 API Endpoint 规范化（支持 DeepSeek 无 /v1、智谱 /v4、Groq /openai/v1 等各种变体）
function normalizeApiEndpoint(raw) {
    if (!raw) return raw;
    var url = String(raw).trim().replace(/\/+$/, ''); // 去掉末尾斜杠

    if (url.includes('/chat/completions')) return url;

    // 已知需要直接追加 /chat/completions 的情况
    // DeepSeek 官方就是 https://api.deepseek.com （无 v1）
    if (/^https?:\/\/api\.deepseek\.com(\/.*)?$/.test(url)) {
        return url.replace(/\/$/, '') + '/chat/completions';
    }

    // 智谱 GLM 特殊路径
    if (url.includes('bigmodel.cn/api/paas/v4') || url.includes('z.ai/api/paas/v4')) {
        return url + '/chat/completions';
    }

    // 标准 OpenAI 兼容：以 /v1 或 /openai/v1 结尾
    if (/\/(v[0-9]+|openai\/v1)$/.test(url)) {
        return url + '/chat/completions';
    }

    // 其他情况：如果没有版本号就补 /v1，否则直接补
    if (!/\/v[0-9]/.test(url) && !url.includes('/paas/')) {
        url += '/v1';
    }
    return url + '/chat/completions';
}

function isLikelyOllamaEndpoint(raw) {
    if (!raw) return false;
    var s = String(raw).toLowerCase();
    return s.indexOf('ollama') !== -1 || s.indexOf(':11434') !== -1;
}

function shouldUseOllamaCompat(endpoint) {
    var settings = state && state.settings ? state.settings : {};
    return !!settings.ollamaCompatMode || isLikelyOllamaEndpoint(endpoint);
}

function normalizeMessagesForOllamaCompatibility(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return messages || [];

    var systemParts = [];
    var normalized = [];
    var seenNonSystem = false;

    messages.forEach(function(msg) {
        if (!msg) return;
        var role = normalizePromptRole(msg.role || 'user');
        var content = msg.content == null ? '' : String(msg.content);
        if (!content.trim()) return;

        if (role === 'system') {
            if (!seenNonSystem) {
                systemParts.push(content);
            } else {
                normalized.push({
                    role: 'user',
                    content: '[System / developer instruction]\n' + content
                });
            }
            return;
        }

        seenNonSystem = true;
        normalized.push({ role: role, content: content });
    });

    var result = [];
    if (systemParts.length > 0) {
        result.push({ role: 'system', content: systemParts.join('\n\n') });
    }
    result = result.concat(normalized);

    return result.reduce(function(acc, msg) {
        var last = acc[acc.length - 1];
        if (last && last.role === msg.role) {
            last.content += '\n\n' + msg.content;
        } else {
            acc.push({ role: msg.role, content: msg.content });
        }
        return acc;
    }, []);
}
