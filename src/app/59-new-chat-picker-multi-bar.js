// ==================== New Chat Picker Multi Bar Helpers ====================
function updateNewChatPickerMultiBar(isMultiSelect, selectedCount) {
    if (!dom.newChatPickerMultiBar) return;
    if (isMultiSelect) {
        dom.newChatPickerMultiBar.classList.remove('hidden');
        if (dom.newChatPickerMultiCount) {
            var prefix = t('new_chat_multi_selected_prefix') || '已选';
            var suffix = t('new_chat_multi_people') || '人';
            dom.newChatPickerMultiCount.textContent = (prefix + ' ' + selectedCount + ' ' + suffix).trim();
        }
    } else {
        dom.newChatPickerMultiBar.classList.add('hidden');
    }
}
