/**
 * 新手导读（文件：68-settings-tabs.js）
 *
 * 负责什么：切换设置弹窗顶部标签，并同步可见面板与无障碍状态。
 * 在程序中的位置：它只管理设置分类导航，不读取或保存任何设置值。
 * 从哪里开始看：主要从 `activateSettingsTab(tabId, focusTab)` 和 `bindSettingsTabs()` 开始阅读。
 * 代码如何生效：scripts/build-app.js 会按照 manifest.json 的顺序，把本文件合并进 assets/js/app.js。
 * 修改时注意：标签按钮的 aria-controls 必须与 index.html 中的面板 id 一一对应。
 */
function activateSettingsTab(tabId, focusTab) {
    var tabList = document.getElementById('settingsTabs');
    var panelsContainer = document.getElementById('settingsPanels');
    var selectedTab = document.getElementById(tabId);
    if (!tabList || !panelsContainer || !selectedTab || !selectedTab.hasAttribute('data-settings-tab')) return;

    var activePanelId = selectedTab.getAttribute('aria-controls');
    tabList.querySelectorAll('[data-settings-tab]').forEach(function(tab) {
        var isActive = tab === selectedTab;
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    panelsContainer.querySelectorAll('[role="tabpanel"]').forEach(function(panel) {
        panel.hidden = panel.id !== activePanelId;
    });

    panelsContainer.scrollTop = 0;
    if (focusTab) selectedTab.focus();
}

function bindSettingsTabs() {
    var tabList = document.getElementById('settingsTabs');
    if (!tabList) return;

    tabList.addEventListener('click', function(event) {
        var tab = event.target.closest('[data-settings-tab]');
        if (tab && tabList.contains(tab)) activateSettingsTab(tab.id, false);
    });

    tabList.addEventListener('keydown', function(event) {
        var currentTab = event.target.closest('[data-settings-tab]');
        if (!currentTab || !tabList.contains(currentTab)) return;

        var tabs = Array.prototype.slice.call(tabList.querySelectorAll('[data-settings-tab]'));
        var currentIndex = tabs.indexOf(currentTab);
        var nextIndex = currentIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;

        event.preventDefault();
        activateSettingsTab(tabs[nextIndex].id, true);
    });

    activateSettingsTab('settingsTabModel', false);
}
