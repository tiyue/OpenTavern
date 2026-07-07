// ==================== Settings Save UI Form ====================
function readUiBehaviorSettingsFromForm() {
    state.settings.uiTheme = dom.uiTheme ? (dom.uiTheme.value || 'new-light') : 'new-light';
    state.settings.uiTheme = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(state.settings.uiTheme) : state.settings.uiTheme;
    if (typeof cacheUiTheme === 'function') cacheUiTheme(state.settings.uiTheme);
    state.settings.lowPowerMode = dom.lowPowerMode ? !!dom.lowPowerMode.checked : false;
}
