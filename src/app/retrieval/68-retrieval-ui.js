/**
 * 新手导读（文件：68-retrieval-ui.js）
 *
 * 负责什么：这是“语义检索”中的“设置与状态界面”部分。
 * 在程序中的位置：它绑定记忆/资料开关、预算、Embedding 测试、索引状态和本机索引清理。
 * 从哪里开始看：主要从 `hydrateRetrievalSettings()`、`bindRetrievalSettingsEvents()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按 manifest.json 顺序把它合并进 assets/js/app.js。
 * 修改时注意：测试按钮必须由用户主动点击并明确说明会发送测试文字；打开设置不能自动联网。
 */
// ==================== Retrieval Settings UI ====================
var retrievalSettingsEventsBound = false;
var retrievalUiBusy = false;

function setRetrievalUiStatus(message) {
    var node = document.getElementById('retrievalIndexStatus');
    if (node) node.textContent = message || '';
}

function setRetrievalEmbeddingStatus(message, warning) {
    var node = document.getElementById('retrievalEmbeddingProfileStatus');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('connection-profile-warning', !!warning);
}

function renderRetrievalEmbeddingStatus() {
    var profile = getActiveRetrievalEmbeddingProfile();
    if (!profile) {
        setRetrievalEmbeddingStatus(t('retrieval_embedding_profile_missing'), true);
        return;
    }
    if (normalizeApiProtocol(profile.protocol) !== 'openai') {
        setRetrievalEmbeddingStatus(t('retrieval_embedding_protocol_unsupported'), true);
        return;
    }
    var credential = typeof getConnectionProfileCredential === 'function' && getConnectionProfileCredential(profile);
    var dimensions = profile.parameters && Number(profile.parameters.embeddingDimensions) || 0;
    var text = profile.name + ' · ' + (profile.model || t('conn_profile_no_model')) + ' · ' +
        (dimensions ? t('retrieval_dimensions').replace('{n}', String(dimensions)) : t('retrieval_dimensions_auto')) +
        (credential ? ' · ' + t('conn_profile_credential_saved') : ' · ' + t('retrieval_embedding_credential_missing'));
    setRetrievalEmbeddingStatus(text, !credential);
}

function renderRetrievalIndexStatus() {
    var status = getRetrievalIndexStatus();
    var parts = [];
    var phaseLabel = {
        idle: t('retrieval_phase_idle'), indexing: t('retrieval_phase_indexing'), ready: t('retrieval_phase_ready'),
        pending: t('retrieval_phase_pending'), error: t('retrieval_phase_error'), 'quota-error': t('retrieval_phase_quota'),
        cancelled: t('retrieval_phase_cancelled'), 'config-error': t('retrieval_phase_config')
    }[status.phase] || status.phase;
    parts.push(phaseLabel);
    if (status.totalSources) parts.push(t('retrieval_status_sources').replace('{done}', String(status.doneSources)).replace('{total}', String(status.totalSources)));
    if (status.totalChunks) parts.push(t('retrieval_status_chunks').replace('{done}', String(status.doneChunks)).replace('{total}', String(status.totalChunks)));
    if (status.requests) parts.push(t('retrieval_status_requests').replace('{n}', String(status.requests)));
    if (status.error) parts.push(status.error);
    else if (status.note) parts.push(status.note);
    setRetrievalUiStatus(parts.join(' · '));
    var readinessNode = document.getElementById('retrievalIndexStatus');
    if (readinessNode && typeof getActiveConv === 'function' && getActiveConv()) {
        getRetrievalReadiness(getActiveConv()).then(function(readiness) {
            var extra = t('retrieval_status_ready').replace('{ready}', String(readiness.ready)).replace('{pending}', String(readiness.pending)).replace('{stale}', String(readiness.stale));
            if (readiness.serviceError) extra += ' · ' + readiness.serviceError;
            if (readinessNode) readinessNode.textContent = (parts.join(' · ') + ' · ' + extra).trim();
        }).catch(function(error) {
            if (readinessNode) readinessNode.textContent = parts.join(' · ') + ' · ' + error.message;
        });
    }
}

function renderRetrievalSettingsControls() {
    ensureRetrievalSettings(state.settings);
    var retrieval = state.settings.retrieval;
    [
        ['retrievalMemoryEnabled', 'memoryEnabled'],
        ['retrievalDocumentsEnabled', 'documentsEnabled']
    ].forEach(function(pair) {
        var input = document.getElementById(pair[0]);
        if (input) input.checked = retrieval[pair[1]] === true;
    });
    [
        ['retrievalTopK', 'topK'],
        ['retrievalMinScore', 'minScore'],
        ['retrievalMemoryBudgetTokens', 'memoryBudgetTokens'],
        ['retrievalDocumentBudgetTokens', 'documentBudgetTokens']
    ].forEach(function(pair) {
        var input = document.getElementById(pair[0]);
        if (input && document.activeElement !== input) input.value = String(retrieval[pair[1]]);
    });
    renderRetrievalEmbeddingStatus();
    renderRetrievalIndexStatus();
}

function hydrateRetrievalSettings() {
    renderRetrievalSettingsControls();
}

function readRetrievalSettingsFromForm(target) {
    if (typeof document === 'undefined') return;
    var settings = target || (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings);
    if (!settings || typeof settings !== 'object') return;
    var memoryInput = document.getElementById('retrievalMemoryEnabled');
    var documentsInput = document.getElementById('retrievalDocumentsEnabled');
    var topKInput = document.getElementById('retrievalTopK');
    var minScoreInput = document.getElementById('retrievalMinScore');
    var memoryBudgetInput = document.getElementById('retrievalMemoryBudgetTokens');
    var documentBudgetInput = document.getElementById('retrievalDocumentBudgetTokens');
    if (!memoryInput || !documentsInput || !topKInput || !minScoreInput || !memoryBudgetInput || !documentBudgetInput) return;
    var topK = Number(topKInput.value);
    var memoryBudgetTokens = Number(memoryBudgetInput.value);
    var documentBudgetTokens = Number(documentBudgetInput.value);
    var minScore = Number(minScoreInput.value);
    if (!Number.isInteger(topK) || topK < 1 || topK > 12) throw new Error(t('retrieval_top_k_invalid'));
    if (!Number.isInteger(memoryBudgetTokens) || memoryBudgetTokens < 100 || memoryBudgetTokens > 2000) throw new Error(t('retrieval_budget_invalid'));
    if (!Number.isInteger(documentBudgetTokens) || documentBudgetTokens < 100 || documentBudgetTokens > 2000) throw new Error(t('retrieval_budget_invalid'));
    if (!minScoreInput.value.trim() || !Number.isFinite(minScore) || minScore < -1 || minScore > 1) throw new Error(t('retrieval_min_score_invalid'));
    settings.retrieval = {
        memoryEnabled: !!memoryInput.checked,
        documentsEnabled: !!documentsInput.checked,
        topK: topK,
        memoryBudgetTokens: memoryBudgetTokens,
        documentBudgetTokens: documentBudgetTokens,
        minScore: minScore
    };
}

function openMemorySourcesDialog() {
    var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
    if (!conv) return;
    var linked = getMemorySourceConversationIds(conv);
    var others = Object.keys(state.conversations || {}).filter(function(id) { return id !== conv.id; }).map(function(id) {
        return state.conversations[id];
    }).sort(function(a, b) { return (b.updated || 0) - (a.updated || 0); });
    var body = '<p class="feature-hint">' + escapeHtml(t('retrieval_memory_sources_hint')) + '</p>' +
        '<div class="feature-row"><span><strong>' + escapeHtml(conv.title || conv.id) + '</strong><small>' + escapeHtml(t('retrieval_memory_current')) + '</small></span></div>' +
        (others.length ? others.map(function(other) {
            return '<label class="feature-check"><input type="checkbox" data-memory-source="' + escapeHtml(other.id) + '"' +
                (linked.indexOf(other.id) >= 0 ? ' checked' : '') + '><span>' + escapeHtml(other.title || other.id) + '</span></label>';
        }).join('') : '<p class="feature-hint">' + escapeHtml(t('retrieval_memory_no_others')) + '</p>') +
        '<p class="feature-hint" id="memorySourcesStatus" role="status" aria-live="polite"></p>';
    openFeatureDialog('memorySourcesDialog', t('retrieval_memory_sources_title'), body, async function(dialog) {
        var ids = Array.prototype.slice.call(dialog.querySelectorAll('[data-memory-source]:checked')).map(function(input) { return input.dataset.memorySource; });
        try {
            await saveCurrentConversationMemorySources(conv, ids);
            var status = dialog.querySelector('#memorySourcesStatus');
            if (status) status.textContent = t('retrieval_memory_sources_saved');
            renderRetrievalIndexStatus();
        } catch (error) {
            throw error;
        }
    }, { saveLabel: t('save') });
}

function bindRetrievalSettingsEvents() {
    if (retrievalSettingsEventsBound) return;
    retrievalSettingsEventsBound = true;
    var testButton = document.getElementById('retrievalTestEmbeddingBtn');
    if (testButton) testButton.addEventListener('click', function() {
        if (retrievalUiBusy) return;
        var profile = getActiveRetrievalEmbeddingProfile();
        retrievalUiBusy = true;
        testButton.disabled = true;
        setRetrievalUiStatus(t('retrieval_test_sending'));
        testRetrievalEmbeddingProfile(profile).then(function(result) {
            setRetrievalUiStatus(t('retrieval_test_ok')
                .replace('{model}', result.model)
                .replace('{dimensions}', String(result.dimensions))
                .replace('{requests}', String(result.requests))
                .replace('{latency}', String(result.latencyMs)));
        }).catch(function(error) {
            setRetrievalUiStatus(t('retrieval_test_failed') + '：' + error.message);
        }).finally(function() {
            retrievalUiBusy = false;
            testButton.disabled = false;
        });
    });
    var memoryButton = document.getElementById('retrievalOpenMemorySourcesBtn');
    if (memoryButton) memoryButton.addEventListener('click', openMemorySourcesDialog);
    var documentsButton = document.getElementById('retrievalOpenDocumentsBtn');
    if (documentsButton) documentsButton.addEventListener('click', function() {
        if (typeof openDocumentLibrary === 'function') openDocumentLibrary();
    });
    var indexButton = document.getElementById('retrievalIndexCurrentBtn');
    if (indexButton) indexButton.addEventListener('click', function() {
        var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
        if (!conv || retrievalUiBusy) return;
        retrievalUiBusy = true;
        indexButton.disabled = true;
        setRetrievalUiStatus(t('retrieval_index_starting'));
        indexRetrievalSources(conv, { memory: true, documents: true }).then(function(result) {
            setRetrievalUiStatus(t('retrieval_index_done')
                .replace('{sources}', String(result.indexedSources))
                .replace('{chunks}', String(result.chunks))
                .replace('{requests}', String(result.requests)));
        }).catch(function(error) {
            setRetrievalUiStatus(t('retrieval_index_failed') + '：' + error.message);
        }).finally(function() {
            retrievalUiBusy = false;
            indexButton.disabled = false;
            renderRetrievalIndexStatus();
        });
    });
    var cancelButton = document.getElementById('retrievalCancelIndexBtn');
    if (cancelButton) cancelButton.addEventListener('click', function() {
        cancelRetrievalRequests();
        renderRetrievalIndexStatus();
    });
    var clearButton = document.getElementById('retrievalClearIndexBtn');
    if (clearButton) clearButton.addEventListener('click', function() {
        confirmFeatureAction(t('retrieval_clear_index_confirm'), t('retrieval_clear_index')).then(function(confirmed) {
            if (!confirmed) return;
            cancelRetrievalIndexing();
            clearRetrievalIndexDatabase().then(function() {
                setRetrievalUiStatus(t('retrieval_clear_index_done'));
                renderRetrievalIndexStatus();
            }).catch(function(error) {
                setRetrievalUiStatus(t('retrieval_clear_index_failed') + '：' + error.message);
            });
        });
    });
}
