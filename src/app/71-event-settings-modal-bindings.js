// ==================== Settings Modal Event Bindings ====================
function bindSettingsModalEvents() {
    if (dom.sidebarSettingsBtn) dom.sidebarSettingsBtn.addEventListener('click', openSettings);
    if (dom.topSettingsBtn) dom.topSettingsBtn.addEventListener('click', openSettings);
    if (dom.settingsCloseBtn) dom.settingsCloseBtn.addEventListener('click', closeSettings);
    if (dom.settingsBackdrop) dom.settingsBackdrop.addEventListener('click', closeSettings);
}
