function getMyCardActionTileConfigs() {
    return [
        {
            iconHtml: '＋',
            iconClass: 'text-4xl mb-2 text-amber-400',
            title: '新建角色',
            subtitle: '手动创建',
            onClick: function() {
                if (typeof openCharacterEditor === 'function') openCharacterEditor();
            }
        },
        {
            iconHtml: 'Import',
            iconClass: 'text-xs mb-2 uppercase tracking-wider text-zinc-500',
            title: '导入角色卡',
            subtitle: '从文件',
            onClick: openMyCardImportModal
        }
    ];
}

function resetMyCardImportModalControls() {
    if (dom.importStatus) dom.importStatus.classList.add('hidden');
    if (dom.importFileInput) dom.importFileInput.value = '';
}
