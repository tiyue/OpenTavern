// 模型工具的两处界面：设置页的本机会话授权/说明/记录，以及消息内的只读调用记录。
function modelToolStatusLabel(status) {
    var key = 'model_tool_status_' + String(status || 'unknown').replace(/-/g, '_');
    return t(key);
}

function renderModelToolTrace(msg) {
    if (!msg || typeof hasModelToolTrace !== 'function' || !hasModelToolTrace(msg.toolTrace)) return '';
    var trace = normalizeModelToolTrace(msg.toolTrace);
    if (!trace) return '';
    if (!trace.rounds.some(function(round) { return round.calls.length; })) return '';
    var html = '<details class="model-tool-trace"><summary>' + escapeHtml(t('model_tool_records')) + ' · ' + escapeHtml(modelToolStatusLabel(trace.status)) + '</summary><div class="model-tool-trace-body">';
    trace.rounds.forEach(function(round) {
        round.calls.forEach(function(call) {
            html += '<div class="model-tool-trace-call">' +
                '<div class="model-tool-trace-head"><strong>' + escapeHtml(call.name) + '</strong><span>' + escapeHtml(modelToolStatusLabel(call.status)) + '</span></div>' +
                '<div class="model-tool-trace-label">' + escapeHtml(t('model_tool_arguments')) + '</div><pre>' + escapeHtml(call.arguments || '{}') + '</pre>' +
                (call.resultPreview ? '<div class="model-tool-trace-label">' + escapeHtml(t('model_tool_result')) + '</div><pre>' + escapeHtml(call.resultPreview) + '</pre>' : '') +
                (call.error ? '<div class="model-tool-trace-error">' + escapeHtml(call.error) + '</div>' : '') +
                '</div>';
        });
    });
    if (trace.diagnostics && trace.diagnostics.finishReason) {
        html += '<div class="model-tool-trace-label">' + escapeHtml(t('model_tool_finish_reason')) + ': ' + escapeHtml(String(trace.diagnostics.finishReason)) + '</div>';
    }
    if (trace.diagnostics && trace.diagnostics.completionReason) {
        html += '<div class="model-tool-trace-label">' + escapeHtml(String(trace.diagnostics.completionReason)) + '</div>';
    }
    return html + '</div></details>';
}

function renderModelToolDefinitions(host) {
    if (!host) return;
    host.textContent = '';
    if (typeof listModelToolDefinitions !== 'function') return;
    listModelToolDefinitions().forEach(function(tool) {
        var row = document.createElement('div');
        row.className = 'feature-row';
        var text = document.createElement('span');
        var title = document.createElement('strong');
        title.textContent = tool.name;
        var description = document.createElement('small');
        description.textContent = tool.description;
        text.append(title, description);
        var details = document.createElement('details');
        var summary = document.createElement('summary');
        summary.textContent = t('model_tool_schema');
        var schema = document.createElement('pre');
        schema.className = 'model-tool-schema';
        schema.textContent = JSON.stringify(tool.inputSchema, null, 2);
        details.append(summary, schema);
        text.appendChild(details);
        row.appendChild(text);
        host.appendChild(row);
    });
}

function renderModelToolRuns(host, conv) {
    if (!host) return;
    host.textContent = '';
    var runs = (conv && Array.isArray(conv.messages) ? conv.messages : []).slice().reverse().filter(function(message) {
        if (!message || typeof hasModelToolTrace !== 'function' || !hasModelToolTrace(message.toolTrace)) return false;
        var trace = normalizeModelToolTrace(message.toolTrace);
        return !!(trace && trace.rounds.some(function(round) { return round.calls.length; }));
    }).slice(0, 4);
    if (!runs.length) {
        var empty = document.createElement('p');
        empty.className = 'feature-hint';
        empty.textContent = t('model_tool_no_records');
        host.appendChild(empty);
        return;
    }
    runs.forEach(function(message) {
        var trace = normalizeModelToolTrace(message.toolTrace);
        if (!trace) return;
        var details = document.createElement('details');
        details.className = 'model-tool-run';
        var summary = document.createElement('summary');
        var callCount = trace.rounds.reduce(function(total, round) { return total + round.calls.length; }, 0);
        summary.textContent = modelToolStatusLabel(trace.status) + ' · ' + callCount + ' ' + t('model_tool_calls');
        details.appendChild(summary);
        trace.rounds.forEach(function(round) {
            round.calls.forEach(function(call) {
                var row = document.createElement('div');
                row.className = 'feature-row';
                var text = document.createElement('span');
                var title = document.createElement('strong');
                title.textContent = call.name + ' · ' + modelToolStatusLabel(call.status);
                var args = document.createElement('small');
                args.textContent = call.arguments || '{}';
                text.append(title, args);
                if (call.resultPreview) {
                    var result = document.createElement('small');
                    result.textContent = call.resultPreview;
                    text.appendChild(result);
                }
                row.appendChild(text);
                details.appendChild(row);
            });
        });
        host.appendChild(details);
    });
}

function hydrateModelToolsSettings() {
    var conv = typeof getActiveConv === 'function' ? getActiveConv() : null;
    var checkbox = document.getElementById('modelToolsConversationEnabled');
    var status = document.getElementById('modelToolsSettingsStatus');
    var definitions = document.querySelector('[data-model-tools-definitions]');
    var runs = document.querySelector('[data-model-tool-runs]');
    var enabled = !!(conv && typeof isModelToolAuthorizedForConversation === 'function' && isModelToolAuthorizedForConversation(conv, state.settings, 'search_conversation'));
    if (checkbox) {
        checkbox.disabled = !conv;
        checkbox.checked = enabled;
        if (!checkbox.dataset.modelToolsBound) {
            checkbox.dataset.modelToolsBound = '1';
            checkbox.addEventListener('change', function() {
                var active = typeof getActiveConv === 'function' ? getActiveConv() : null;
                if (!active) return;
                setModelToolConversationGrant(active.id, 'search_conversation', checkbox.checked);
                if (typeof persistState === 'function') persistState();
                hydrateModelToolsSettings();
            });
        }
    }
    if (status) status.textContent = conv ? (enabled ? t('model_tool_enabled_current') : t('model_tool_disabled_hint')) : t('model_tool_no_conversation');
    renderModelToolDefinitions(definitions);
    renderModelToolRuns(runs, conv);
}
