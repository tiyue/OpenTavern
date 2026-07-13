// ==================== Qwen Image Error Helpers ====================
function sanitizeImageGenerationErrorField(value, maxLength) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    var text = String(value).slice(0, 4096)
        .replace(
            /data:image\/[A-Za-z0-9.+-]+;base64,(?:[A-Za-z0-9+/=]+[ \t\r\n]*)+/gi,
            'data:image/[REDACTED];base64,[REDACTED]'
        )
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return '';
    text = text.replace(
        /\b(authorization|api[-_ ]?key|access[-_ ]?token|token|signature|access[-_ ]?key(?:id)?|security[-_ ]?token|credential)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
        function(_, label) { return label + '=[REDACTED]'; }
    );
    text = text.replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]');
    text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
    text = text.replace(
        /data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
        'data:image/[REDACTED];base64,[REDACTED]'
    );
    text = text.replace(/https?:\/\/[^\s]+/gi, '[URL]');
    text = text.replace(/<[^>]{1,200}>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, Math.max(1, Number(maxLength) || 500));
}

function sanitizeImageGenerationErrorCode(value, maxLength) {
    return sanitizeImageGenerationErrorField(value, maxLength)
        .replace(/[^A-Za-z0-9_.:-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, Math.max(1, Number(maxLength) || 100));
}

function sanitizeImageGenerationRequestId(value) {
    return sanitizeImageGenerationErrorField(value, 128)
        .replace(/[^A-Za-z0-9_.:-]+/g, '')
        .slice(0, 128);
}

function createImageGenerationRequestError(status, payload, fallbackText) {
    var payloadError = payload && payload.error;
    var payloadErrorObject = payloadError && typeof payloadError === 'object' ? payloadError : null;
    var providerError = payload && payload.providerError && typeof payload.providerError === 'object'
        ? payload.providerError
        : null;
    var message = sanitizeImageGenerationErrorField(
        payloadErrorObject && payloadErrorObject.message
            || (typeof payloadError === 'string' ? payloadError : '')
            || payload && payload.message
            || (payload ? fallbackText : ''),
        500
    );
    var reason = sanitizeImageGenerationErrorField(
        payload && (payload.reason || payload.errorReason)
            || providerError && providerError.message
            || payloadErrorObject && payloadErrorObject.reason,
        500
    );
    var error = new Error(message || reason || ('HTTP ' + status));
    error.status = status;
    error.provider = sanitizeImageGenerationErrorField(payload && payload.provider, 32).toLowerCase();
    error.code = sanitizeImageGenerationErrorCode(
        payload && (payload.code || payload.errorCode)
            || payloadErrorObject && payloadErrorObject.code,
        100
    );
    error.upstreamCode = sanitizeImageGenerationErrorCode(
        payload && payload.upstreamCode
            || providerError && providerError.code
            || payloadErrorObject && payloadErrorObject.upstreamCode,
        100
    );
    error.reason = reason;
    error.requestId = sanitizeImageGenerationRequestId(
        payload && (payload.requestId || payload.request_id)
            || payloadErrorObject && (payloadErrorObject.requestId || payloadErrorObject.request_id)
    );
    var upstreamStatus = Number(payload && payload.upstreamStatus);
    error.upstreamStatus = Number.isFinite(upstreamStatus) && upstreamStatus > 0 ? upstreamStatus : 0;
    return error;
}

function buildImageGenerationErrorMetadata(error) {
    var parts = [];
    var code = sanitizeImageGenerationErrorCode(error && (error.upstreamCode || error.code), 100);
    var requestId = sanitizeImageGenerationRequestId(error && error.requestId);
    if (code) parts.push('错误码：' + code);
    if (requestId) parts.push('请求 ID：' + requestId);
    return parts.length ? '（' + parts.join('；') + '）' : '';
}

function formatImageGenerationError(error) {
    if (error && error.name === 'AbortError') return '图片生成已取消。';
    var message = sanitizeImageGenerationErrorField(error && error.message || error || '未知错误', 500);
    if (/failed to fetch|fetch failed|networkerror|load failed/i.test(message)) {
        return '无法连接图片生成服务，请检查服务端点、网络和跨域配置。';
    }
    if (error && error.status === 401) return '图片服务拒绝访问，请检查访问令牌。';
    var reason = sanitizeImageGenerationErrorField(error && error.reason, 500);
    var metadata = buildImageGenerationErrorMetadata(error);
    if (error && error.provider === 'qwen') {
        return (error.status === 429 ? 'Qwen 图片生成请求受限：' : 'Qwen 图片生成失败：')
            + (reason || message || '未知原因')
            + metadata;
    }
    if (error && error.status === 429) {
        return '图片服务请求过于频繁，请稍后再试。' + (reason ? ' 原因：' + reason : '') + metadata;
    }
    if (reason) return '图片生成失败：' + reason + metadata;
    return message + metadata;
}
