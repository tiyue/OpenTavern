/**
 * 新手导读（文件：31-retrieval-embeddings.js）
 *
 * 负责什么：这是“语义检索”中的“Embedding HTTP 适配”部分。
 * 在程序中的位置：它只使用明确选择、用途为 embedding 的本机凭据，调用 OpenAI 兼容的 Embeddings 接口。
 * 从哪里开始看：主要从 `buildRetrievalEmbeddingService()`、`normalizeRetrievalEmbeddingEndpoint()`、`requestRetrievalEmbeddings()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：不能继承主回复密钥，不能把认证放进 URL；聊天/摘要接口不能冒充 Embedding 服务。
 */
// ==================== Retrieval Embedding Adapter ====================
var RETRIEVAL_EMBEDDING_BATCH_SIZE = 8;
var RETRIEVAL_EMBEDDING_REQUEST_TIMEOUT_MS = 30000;
var RETRIEVAL_EMBEDDING_TEST_TIMEOUT_MS = 20000;
var RETRIEVAL_EMBEDDING_MAX_INPUT_CHARS = 8000;
var RETRIEVAL_EMBEDDING_MAX_BATCH_CHARS = 24000;
var RETRIEVAL_EMBEDDING_MAX_DIMENSIONS = 8192;
var RETRIEVAL_EMBEDDING_TEST_TEXT = 'OpenTavern Embedding 连接测试：北境风雪与旧日记忆。';

function normalizeRetrievalEmbeddingEndpoint(endpoint) {
    var value = String(endpoint || '').trim();
    if (!value) throw new Error(t('retrieval_embedding_endpoint_required'));
    if (/[?#]/.test(value)) throw new Error(t('retrieval_embedding_endpoint_invalid'));
    try {
        if (typeof URL !== 'undefined') {
            var parsed = new URL(value, typeof location !== 'undefined' ? location.href : 'http://localhost/');
            if (parsed.username || parsed.password) throw new Error(t('retrieval_embedding_endpoint_invalid'));
        }
    } catch (error) {
        if (error && error.message === t('retrieval_embedding_endpoint_invalid')) throw error;
        throw new Error(t('retrieval_embedding_endpoint_invalid'));
    }
    var trimmed = value.replace(/\/+$/, '');
    if (/\/embeddings$/i.test(trimmed)) return trimmed;
    if (/\/v1$/i.test(trimmed)) return trimmed + '/embeddings';
    if (/\/(?:chat\/completions|completions|models)$/i.test(trimmed)) return trimmed.replace(/\/(?:chat\/completions|completions|models)$/i, '/embeddings');
    try {
        var path = typeof URL !== 'undefined' ? new URL(trimmed, 'http://localhost/').pathname : '';
        if (!path || path === '/') return trimmed + '/v1/embeddings';
    } catch (_) {}
    return trimmed + '/embeddings';
}

function getActiveRetrievalEmbeddingProfile(settings) {
    settings = settings || state.settings;
    if (typeof ensureConnectionProfiles === 'function') ensureConnectionProfiles(settings);
    if (!settings || !Array.isArray(settings.connectionProfiles)) {
        if (typeof getActiveConnectionProfile === 'function') return getActiveConnectionProfile('embedding');
        return null;
    }
    var ids = settings && settings.activeConnectionProfileIds || {};
    var profiles = settings && Array.isArray(settings.connectionProfiles) ? settings.connectionProfiles : [];
    var profile = profiles.find(function(item) { return item && item.id === ids.embedding && item.purpose === 'embedding'; });
    return profile || null;
}

function buildRetrievalEmbeddingService(profile, settings) {
    profile = profile || getActiveRetrievalEmbeddingProfile(settings);
    if (!profile) throw new Error(t('retrieval_embedding_profile_missing'));
    if (String(profile.purpose || '') !== 'embedding') throw new Error(t('retrieval_embedding_profile_missing'));
    if (normalizeApiProtocol(profile.protocol) !== 'openai') throw new Error(t('retrieval_embedding_protocol_unsupported'));
    var endpoint = String(profile.endpoint || '').trim();
    var model = String(profile.model || '').trim();
    if (!endpoint) throw new Error(t('retrieval_embedding_endpoint_required'));
    if (!model) throw new Error(t('retrieval_embedding_model_required'));
    var rawDimensions = profile.parameters && profile.parameters.embeddingDimensions;
    var configuredDimensions = 0;
    if (rawDimensions !== undefined && rawDimensions !== null && rawDimensions !== '') {
        if (typeof rawDimensions !== 'number' && typeof rawDimensions !== 'string') {
            throw new Error(t('retrieval_embedding_dimensions_invalid'));
        }
        configuredDimensions = Number(rawDimensions);
    }
    if (!Number.isInteger(configuredDimensions) || configuredDimensions < 0 || configuredDimensions > RETRIEVAL_EMBEDDING_MAX_DIMENSIONS) {
        throw new Error(t('retrieval_embedding_dimensions_invalid'));
    }
    var credential = typeof getConnectionProfileCredential === 'function' ? getConnectionProfileCredential(profile) : '';
    if (!credential) throw new Error(t('retrieval_embedding_credential_missing'));
    return {
        profileId: profile.id,
        protocol: 'openai',
        endpoint: endpoint,
        url: normalizeRetrievalEmbeddingEndpoint(endpoint),
        model: model,
        configuredDimensions: configuredDimensions,
        credential: credential
    };
}

function getRetrievalEmbeddingBaseSignature(service) {
    if (!service) return '';
    return ['openai', String(service.url || '').trim(), String(service.model || '').trim(), String(service.configuredDimensions || 0)].join('|');
}

function getRetrievalEmbeddingIndexSignature(service, dimensions) {
    var value = Number(dimensions);
    if (!Number.isInteger(value) || value < 0) throw new Error(t('retrieval_embedding_dimensions_invalid'));
    return getRetrievalEmbeddingBaseSignature(service) + '|d' + String(value);
}

function validateRetrievalEmbeddingVector(vector, index, dimensions) {
    if (!Array.isArray(vector) || !vector.length) throw new Error(t('retrieval_embedding_vector_invalid'));
    if (vector.length > RETRIEVAL_EMBEDDING_MAX_DIMENSIONS) throw new Error(t('retrieval_embedding_vector_invalid'));
    var numbers = new Array(vector.length);
    for (var i = 0; i < vector.length; i++) {
        var value = vector[i];
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(t('retrieval_embedding_vector_invalid'));
        numbers[i] = value;
    }
    if (dimensions != null) {
        var expected = Number(dimensions);
        if (!Number.isInteger(expected) || expected < 1) throw new Error(t('retrieval_embedding_dimensions_invalid'));
        if (numbers.length !== expected) throw new Error(t('retrieval_embedding_dimension_mismatch'));
    }
    return numbers;
}

function parseRetrievalEmbeddingResponse(json, expectedCount, service) {
    var data = json && Array.isArray(json.data) ? json.data : null;
    if (!data || data.length !== expectedCount) throw new Error(t('retrieval_embedding_response_invalid'));
    var configuredDimensions = service && service.configuredDimensions != null ? Number(service.configuredDimensions) : 0;
    if (configuredDimensions && (!Number.isInteger(configuredDimensions) || configuredDimensions < 1)) {
        throw new Error(t('retrieval_embedding_dimensions_invalid'));
    }
    var ordered = new Array(expectedCount);
    var dimensions = 0;
    data.forEach(function(item, position) {
        if (!item || !Number.isInteger(item.index) || item.index < 0 || item.index >= expectedCount || ordered[item.index]) {
            throw new Error(t('retrieval_embedding_response_order'));
        }
        var vector = validateRetrievalEmbeddingVector(item.embedding, position, null);
        if (!dimensions) dimensions = vector.length;
        else if (vector.length !== dimensions) throw new Error(t('retrieval_embedding_dimension_mismatch'));
        if (configuredDimensions && vector.length !== configuredDimensions) throw new Error(t('retrieval_embedding_dimension_mismatch'));
        ordered[item.index] = vector;
    });
    if (ordered.some(function(vector) { return !vector; })) throw new Error(t('retrieval_embedding_response_order'));
    return { vectors: ordered, dimensions: dimensions };
}

function requestRetrievalEmbeddings(service, texts, options) {
    options = options || {};
    if (!service || !service.url || !service.model) return Promise.reject(new Error(t('retrieval_embedding_service_invalid')));
    if (!Array.isArray(texts) || !texts.length || texts.length > RETRIEVAL_EMBEDDING_BATCH_SIZE) {
        return Promise.reject(new Error(t('retrieval_embedding_batch_invalid')));
    }
    var input = texts.map(function(text) { return String(text == null ? '' : text); });
    var totalChars = input.reduce(function(sum, text) { return sum + text.length; }, 0);
    if (input.some(function(text) { return !text.trim() || text.length > RETRIEVAL_EMBEDDING_MAX_INPUT_CHARS; }) ||
        totalChars > RETRIEVAL_EMBEDDING_MAX_BATCH_CHARS) {
        return Promise.reject(new Error(t('retrieval_embedding_batch_invalid')));
    }
    var parentSignal = options.signal || null;
    if (parentSignal && parentSignal.aborted) return Promise.reject(new Error(t('retrieval_embedding_aborted')));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeoutMs = Number(options.timeoutMs) || RETRIEVAL_EMBEDDING_REQUEST_TIMEOUT_MS;
    var timer = setTimeout(function() {
        if (controller) controller.abort();
    }, timeoutMs);
    var detachParentAbort = null;
    if (parentSignal) {
        var abortFromParent = function() {
            if (controller) controller.abort();
        };
        parentSignal.addEventListener('abort', abortFromParent, { once: true });
        detachParentAbort = function() {
            parentSignal.removeEventListener('abort', abortFromParent);
        };
        if (parentSignal.aborted && controller) controller.abort();
    }
    var request = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + service.credential
        },
        body: JSON.stringify({ model: service.model, input: input })
    };
    if (controller) request.signal = controller.signal;
    else if (parentSignal) request.signal = parentSignal;
    return fetch(service.url, request).then(function(response) {
        if ((controller && controller.signal.aborted) || (parentSignal && parentSignal.aborted)) {
            var abortError = new Error('aborted');
            abortError.name = 'AbortError';
            throw abortError;
        }
        return response.text().then(function(raw) {
            if (!response.ok) {
                var detail = '';
                try {
                    var errorJson = JSON.parse(raw);
                    detail = String(errorJson && (errorJson.error && (errorJson.error.message || errorJson.error) || errorJson.message) || '');
                } catch (_) {
                    detail = raw.slice(0, 300);
                }
                throw new Error(t('retrieval_embedding_http_error') + ' ' + response.status + (detail ? ': ' + detail : ''));
            }
            var json;
            try { json = JSON.parse(raw); } catch (_) { throw new Error(t('retrieval_embedding_response_invalid')); }
            return parseRetrievalEmbeddingResponse(json, input.length, service);
        });
    }).catch(function(error) {
        if (error && error.name === 'AbortError') throw new Error(t('retrieval_embedding_aborted'));
        throw error;
    }).finally(function() {
        clearTimeout(timer);
        if (detachParentAbort) detachParentAbort();
    });
}

function testRetrievalEmbeddingProfile(profile, options) {
    var service;
    try {
        service = buildRetrievalEmbeddingService(profile);
    } catch (error) {
        return Promise.reject(error);
    }
    var started = Date.now();
    return requestRetrievalEmbeddings(service, [RETRIEVAL_EMBEDDING_TEST_TEXT], {
        timeoutMs: RETRIEVAL_EMBEDDING_TEST_TIMEOUT_MS,
        signal: options && options.signal
    }).then(function(result) {
        return {
            ok: true,
            requests: 1,
            model: service.model,
            endpoint: service.url,
            dimensions: result.dimensions,
            latencyMs: Date.now() - started,
            sampleText: RETRIEVAL_EMBEDDING_TEST_TEXT
        };
    });
}
