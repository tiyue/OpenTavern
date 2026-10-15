/**
 * 新手导读（文件：60-public-card-import-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“公共、角色卡、导入、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `importPublicCard(cardMeta)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Public Card Import Flow ====================
async function importPublicCard(cardMeta) {
    const modal = dom.cardLibraryModal;
    try {
        const jsonUrl = resolvePublicCardJsonUrl(cardMeta);
        // 本地优先：已准备的分项走同源缓存，其余按白名单地址取回并校验；保留原确认/世界书/可靠保存流程。
        const res = (typeof LocalResourceManager !== 'undefined' && LocalResourceManager && typeof LocalResourceManager.readPublic === 'function')
            ? await LocalResourceManager.readPublic(jsonUrl)
            : await fetch(jsonUrl);
        if (!res.ok) throw new Error('无法获取角色卡数据 (' + res.status + ')');
        const jsonData = await res.json();

        // 1. 解析角色卡（支持 v1/v2/v3）
        const character = importCharacterCard(jsonData);
        if (!character || !character.name) {
            throw new Error('角色卡格式无效或缺少名称');
        }
        if (typeof requestCharacterRegexConsent === 'function') {
            await requestCharacterRegexConsent(character);
        }

        // 2. 准备内嵌世界书记录（如果有），只构造独立对象，不写入 state.worldBooks；
        //    形状与 createNewWorldBook 保持一致（wb-Date-Mathrandom id），落盘确认后再合并进 state。
        let embeddedBook = null;
        try {
            const cb = getEmbeddedCharacterBook(jsonData);
            const normalized = cb && normalizeImportedWorldInfo(cb);
            if (normalized && normalized.entries && Object.keys(normalized.entries).length > 0) {
                embeddedBook = {
                    id: 'wb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                    name: normalized.name || getImportedCharacterBookName(cb, character.name),
                    entries: normalized.entries,
                    created: Date.now()
                };
            }
        } catch (e) {
            console.warn('[Card Library] 嵌入世界书导入失败（不影响角色导入）:', e);
        }

        // 3. 从公共库元数据附加预览图（关键修复：让从公共库导入的角色卡在“我的卡片”里能显示图片）
        applyPublicCardImportMetadata(character, cardMeta);

        // 4. 可靠保存：角色/世界书先写入隔离快照，确认落盘成功后才提交到 live state 并提示成功
        const committed = await persistImportedPublicCardRecords(character, embeddedBook);
        if (!committed) throw new Error('角色卡保存未确认，请重试。');

        // 5. 刷新界面
        requestFullRender();

        // 关闭弹窗
        if (modal) modal.classList.add('hidden');

        // 提示（使用现有风格的简单提示）
        if (!window.__suppressPublicCardImportToast) {
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
        }

        refreshPublicCardImportViews();
        return character;

    } catch (err) {
        console.error('[Card Library] Import failed:', err);
        alert('导入失败：' + (err.message || err));
        return null;
    }
}

// 侧边栏按钮事件（在 DOM 就绪后绑定）
// (old wireCardLibraryButton removed as public library on left is removed)
