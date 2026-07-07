// ==================== Public Card Import Flow ====================
async function importPublicCard(cardMeta) {
    const modal = dom.cardLibraryModal;
    try {
        const res = await fetch(resolvePublicCardJsonUrl(cardMeta));
        if (!res.ok) throw new Error('无法获取角色卡数据 (' + res.status + ')');
        const jsonData = await res.json();

        // 1. 解析角色卡（支持 v1/v2/v3）
        const character = importCharacterCard(jsonData);
        if (!character || !character.name) {
            throw new Error('角色卡格式无效或缺少名称');
        }

        // 2. 自动导入内嵌世界书（如果有）
        let embeddedBook = null;
        try {
            embeddedBook = importCharacterBookFromCard(jsonData, character.name);
            // importCharacterBookFromCard 内部已调用 createNewWorldBook 并写入 state.worldBooks
        } catch (e) {
            console.warn('[Card Library] 嵌入世界书导入失败（不影响角色导入）:', e);
        }

        // 3. 从公共库元数据附加预览图（关键修复：让从公共库导入的角色卡在“我的卡片”里能显示图片）
        applyPublicCardImportMetadata(character, cardMeta);

        // 4. 注册到全局角色库
        storeImportedPublicCardCharacter(character);

        // 4. 持久化 + 刷新界面
        persistState();
        requestFullRender();

        // 关闭弹窗
        if (modal) modal.classList.add('hidden');

        // 提示（使用现有风格的简单提示）
        const successMsg = t('card_library_import_success') || '角色卡已成功导入到本地库！';
        // 简单 toast 风格
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-2xl glass text-sm text-amber-300 border border-amber-500/30 shadow-xl';
        toast.textContent = successMsg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2200);

        refreshPublicCardImportViews();

    } catch (err) {
        console.error('[Card Library] Import failed:', err);
        alert('导入失败：' + (err.message || err));
    }
}

// 侧边栏按钮事件（在 DOM 就绪后绑定）
// (old wireCardLibraryButton removed as public library on left is removed)
