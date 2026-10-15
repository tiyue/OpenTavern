/**
 * 新手导读（文件：31-api-model-catalog.js）
 *
 * 负责什么：把 /models 返回值保存成可选择列表，同时保留任意手填 Model ID。
 * 在程序中的位置：连接探测响应解析之后、设置事件绑定之前加载。
 * 从哪里开始看：从 `applyDiscoveredApiModels(models)` 与 `bindApiModelCatalogEvents()` 开始阅读。
 * 修改时注意：模型名称来自外部接口，只能通过 textContent / option.value 写入界面。
 */
function normalizeApiModelCatalog(models) {
    var seen = {};
    return (Array.isArray(models) ? models : []).map(function(model) {
        return String(model || '').trim();
    }).filter(function(model) {
        if (!model || seen[model]) return false;
        seen[model] = true;
        return true;
    });
}

function renderApiModelCatalog() {
    if (!dom.modelCatalog) return;
    var settings = typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings;
    var models = normalizeApiModelCatalog(settings.apiModelCatalog);
    settings.apiModelCatalog = models;
    dom.modelCatalog.innerHTML = '';

    var custom = document.createElement('option');
    custom.value = '';
    custom.textContent = t('settings_model_custom_option');
    dom.modelCatalog.appendChild(custom);

    models.forEach(function(model) {
        var option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        dom.modelCatalog.appendChild(option);
    });

    dom.modelCatalog.value = models.indexOf(settings.model) >= 0 ? settings.model : '';
}

function applyDiscoveredApiModels(models, target) {
    var settings = target || (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings);
    settings.apiModelCatalog = normalizeApiModelCatalog(models);
    renderApiModelCatalog();
    if (!settings.model && settings.apiModelCatalog.length) {
        settings.model = settings.apiModelCatalog[0];
        if (dom.modelName) dom.modelName.value = settings.model;
        if (dom.modelCatalog) dom.modelCatalog.value = settings.model;
    }
    return settings.apiModelCatalog;
}

function setApiConnectionStatus(key, connected) {
    if (!dom.apiConnectionStatus) return;
    dom.apiConnectionStatus.textContent = t(key);
    dom.apiConnectionStatus.classList.toggle('text-emerald-500', !!connected);
    dom.apiConnectionStatus.classList.toggle('text-zinc-500', !connected);
}

function setApiModelCatalogBusy(busy) {
    [dom.apiConnectBtn, dom.apiRefreshModelsBtn].forEach(function(button) {
        if (button) button.disabled = !!busy;
    });
    if (busy) setApiConnectionStatus('api_status_connecting', false);
}

function syncModelNameFromCatalog() {
    if (!dom.modelCatalog || !dom.modelName || !dom.modelCatalog.value) return;
    dom.modelName.value = dom.modelCatalog.value;
    (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings).model = dom.modelCatalog.value;
}

function syncModelCatalogFromName() {
    if (!dom.modelCatalog || !dom.modelName) return;
    var value = String(dom.modelName.value || '').trim();
    var settings = typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings;
    var models = normalizeApiModelCatalog(settings.apiModelCatalog);
    dom.modelCatalog.value = models.indexOf(value) >= 0 ? value : '';
}

function bindApiModelCatalogEvents() {
    if (dom.modelCatalog) dom.modelCatalog.addEventListener('change', syncModelNameFromCatalog);
    if (dom.modelName) dom.modelName.addEventListener('input', syncModelCatalogFromName);
    [dom.apiConnectBtn, dom.apiRefreshModelsBtn].forEach(function(button) {
        if (!button) return;
        button.addEventListener('click', function() {
            window.testMainApiConnection();
        });
    });
}
