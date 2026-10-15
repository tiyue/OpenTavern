/**
 * API Token 用量元数据。usage 始终可写入助手消息；设置项只控制是否渲染。
 */
function parseApiUsage(payload) {
    if (!payload || typeof payload !== 'object' || !payload.usage || typeof payload.usage !== 'object') return null;
    var usage = payload.usage;
    var prompt = Number(usage.prompt_tokens != null ? usage.prompt_tokens : usage.promptTokens);
    var completion = Number(usage.completion_tokens != null ? usage.completion_tokens : usage.completionTokens);
    var total = Number(usage.total_tokens != null ? usage.total_tokens : usage.totalTokens);
    var cached = NaN;
    if (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens != null) {
        cached = Number(usage.prompt_tokens_details.cached_tokens);
    } else if (usage.prompt_tokens_details && usage.prompt_tokens_details.cachedTokens != null) {
        cached = Number(usage.prompt_tokens_details.cachedTokens);
    } else if (usage.prompt_cache_hit_tokens != null) {
        cached = Number(usage.prompt_cache_hit_tokens);
    } else if (usage.cached_tokens != null) {
        cached = Number(usage.cached_tokens);
    }
    if (!Number.isFinite(prompt) && !Number.isFinite(completion)) return null;
    var result = {
        promptTokens: Number.isFinite(prompt) ? Math.max(0, Math.round(prompt)) : 0,
        completionTokens: Number.isFinite(completion) ? Math.max(0, Math.round(completion)) : 0,
        source: 'api'
    };
    if (Number.isFinite(total) && total > 0) result.totalTokens = Math.round(total);
    if (Number.isFinite(cached) && cached > 0) result.cachedTokens = Math.round(cached);
    return result;
}

function finalizeUsageMeta(meta, durationMs) {
    if (!meta || typeof meta !== 'object') return null;
    var prompt = Number(meta.promptTokens);
    var completion = Number(meta.completionTokens);
    if (!Number.isFinite(prompt)) prompt = 0;
    if (!Number.isFinite(completion)) completion = 0;
    if (!(prompt > 0 || completion > 0)) return null;
    var result = {
        promptTokens: Math.max(0, Math.round(prompt)),
        completionTokens: Math.max(0, Math.round(completion)),
        source: 'api'
    };
    if (Number.isFinite(Number(meta.totalTokens)) && Number(meta.totalTokens) > 0) result.totalTokens = Math.round(Number(meta.totalTokens));
    if (Number.isFinite(Number(meta.cachedTokens)) && Number(meta.cachedTokens) > 0) result.cachedTokens = Math.round(Number(meta.cachedTokens));
    if (Number.isFinite(Number(durationMs)) && Number(durationMs) > 0) {
        result.durationMs = Math.round(Number(durationMs));
        if (result.completionTokens > 0) result.tokensPerSecond = Math.round((result.completionTokens / (result.durationMs / 1000)) * 10) / 10;
    }
    return result;
}

function formatMessageTokenCount(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return '0';
    if (number >= 1000000) return (Math.round(number / 100000) / 10).toString().replace(/\.0$/, '') + 'M';
    if (number >= 1000) return (Math.round(number / 100) / 10).toString().replace(/\.0$/, '') + 'K';
    return String(Math.round(number));
}

function renderMsgTokenMeta(msg) {
    if (!state.settings || !state.settings.showMsgTokenUsage || !msg || msg.role === 'user') return '';
    var usage = msg.usage;
    if (!usage || typeof usage !== 'object') return '';
    var prompt = Number(usage.promptTokens) || 0;
    var completion = Number(usage.completionTokens) || 0;
    if (!(prompt > 0 || completion > 0)) return '';
    var input = '↑ ' + formatMessageTokenCount(prompt) + ' tokens';
    var cached = Number(usage.cachedTokens);
    if (Number.isFinite(cached) && cached > 0) input += ' (' + formatMessageTokenCount(cached) + ' ' + escapeHtml(t('msg_token_usage_cached')) + ')';
    var parts = [
        '<span class="msg-token-part">' + input + '</span>',
        '<span class="msg-token-part">↓ ' + formatMessageTokenCount(completion) + ' tokens</span>'
    ];
    var speed = Number(usage.tokensPerSecond);
    if (Number.isFinite(speed) && speed > 0) {
        var icon = '<svg class="msg-token-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>';
        parts.push('<span class="msg-token-part">' + icon + speed.toFixed(1) + ' ' + escapeHtml(t('msg_token_usage_tok_s')) + '</span>');
    }
    return '<div class="msg-token-meta">' + parts.join('') + '</div>';
}
