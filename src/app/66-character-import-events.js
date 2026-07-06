// ==================== Character Import Modal Events ====================
function bindCharacterImportModalEvents() {
    dom.importCloseBtn.addEventListener('click', function() { dom.importModal.classList.add('hidden'); });
    dom.importBackdrop.addEventListener('click', function() { dom.importModal.classList.add('hidden'); });

    dom.importFileInput.addEventListener('change', async function(e) {
        var file = e.target.files[0];
        if (!file) return;

        dom.importStatus.classList.remove('hidden');
        dom.importStatus.textContent = 'Reading...';

        try {
            let json;
            const lowerName = (file.name || '').toLowerCase();
            let attachedPreview = null;

            if (lowerName.endsWith('.png')) {
                attachedPreview = await new Promise(function(resolve, reject) {
                    var r = new FileReader();
                    r.onload = function() { resolve(r.result); };
                    r.onerror = reject;
                    r.readAsDataURL(file);
                });
                json = await extractCharaFromPng(file);
            } else {
                const text = await new Promise(function(resolve, reject) {
                    var r = new FileReader();
                    r.onload = function() { resolve(r.result); };
                    r.onerror = reject;
                    r.readAsText(file);
                });
                json = JSON.parse(text);
            }

            var character = importCharacterCard(json);
            if (attachedPreview) {
                character.previewImage = attachedPreview;
            }
            var conv = getActiveConv();
            if (!conv) { newConversation(); conv = getActiveConv(); }

            var hasMsgs = conv.messages.some(function(m) { return m.role !== 'system'; });
            if (hasMsgs) {
                saveCurrentConversation();
                var oldWorldInfo = conv.worldInfo ? JSON.parse(JSON.stringify(conv.worldInfo)) : null;
                var oldWorldBookIds = Array.isArray(conv.worldBookIds) ? conv.worldBookIds.slice() : [];

                var newConv = defaultConversation();
                state.conversations[newConv.id] = newConv;
                state.conversationOrder.unshift(newConv.id);
                state.activeConvId = newConv.id;
                conv = newConv;

                if (oldWorldInfo) {
                    conv.worldInfo = oldWorldInfo;
                }
                if (oldWorldBookIds.length > 0) {
                    conv.worldBookIds = oldWorldBookIds;
                }
            }

            conv.character = character;
            conv.title = t('chat_with') + character.name;
            conv.messages = [];

            currentCharacterName = character.name;

            var embeddedBook = null;
            try {
                embeddedBook = importCharacterBookFromCard(json, character.name);
                if (embeddedBook) {
                    conv.worldBookIds = conv.worldBookIds || [];
                    if (!conv.worldBookIds.includes(embeddedBook.id)) {
                        conv.worldBookIds.push(embeddedBook.id);
                    }
                }
            } catch (e) {
                console.warn('Failed to import embedded character book; character import continues:', e);
            }

            if (character.name) {
                const key = character.name.trim().toLowerCase();
                if (!state.characters) state.characters = {};
                state.characters[key] = JSON.parse(JSON.stringify(character));
            }

            var charName = character.name;
            var userName = state.settings.userName || 'User';
            var firstMes = replacePlaceholders(character.first_mes, charName, userName);
            if (firstMes) {
                conv.messages.push({ role: 'assistant', content: firstMes });
            }

            conv.updated = Date.now();
            persistState();

            if (typeof renderLibraryGrids === 'function') {
                renderLibraryGrids();
            }

            renderAll();
            dom.importModal.classList.add('hidden');
            dom.importStatus.classList.remove('hidden');

            var successText = t('import_success') + character.name;
            if (embeddedBook) {
                var entryCount = Object.keys(embeddedBook.entries || {}).length;
                successText += ' (embedded world book linked: ' + entryCount + ' entries)';
            }
            dom.importStatus.textContent = successText;
            dom.importStatus.className = 'text-xs text-emerald-400 mt-3 text-center';
            setTimeout(function() { dom.importStatus.classList.add('hidden'); }, 2800);
        } catch (err) {
            dom.importStatus.classList.remove('hidden');
            dom.importStatus.textContent = t('import_error') + ': ' + (err.message || err);
            dom.importStatus.className = 'text-xs text-red-400 mt-3 text-center';
        } finally {
            if (dom.importFileInput) dom.importFileInput.value = '';
        }
    });
}
