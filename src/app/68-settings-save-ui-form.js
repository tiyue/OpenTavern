// ==================== Settings Save UI Form ====================
function readUiBehaviorSettingsFromForm() {
    state.settings.uiTheme = readControlValueOr(dom.uiTheme, 'new-light');
    state.settings.uiTheme = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(state.settings.uiTheme) : state.settings.uiTheme;
    if (typeof cacheUiTheme === 'function') cacheUiTheme(state.settings.uiTheme);
    state.settings.lowPowerMode = readCheckboxControlValue(dom.lowPowerMode, false);
}
