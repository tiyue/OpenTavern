function showNewChatCharacterPicker() {
    const modal = dom.newChatPickerModal;
    const listContainer = dom.newChatPickerList;
    if (!modal || !listContainer) {
        newConversation();
        return;
    }

    // Consume the "came from quick menu" flag for this opening
    const cameFromQuick = !!newChatPickerCameFromQuick;
    newChatPickerCameFromQuick = false;

    // Reset header classes every time (the back button may have mutated them on previous open)
    const headerForReset = modal.querySelector('.flex.items-center.mb-4') || modal.querySelector('h2')?.parentElement;
    if (headerForReset) {
        headerForReset.classList.remove('justify-start', 'gap-2');
        headerForReset.classList.add('justify-between');
        const oldTitle = headerForReset.querySelector('h2');
        if (oldTitle) oldTitle.classList.remove('mr-auto');
    }

    listContainer.innerHTML = '';

    const characters = getAllAvailableCharacters();
    let multiSelectMode = false;
    const selectedKeys = new Set(); // 使用 name.toLowerCase() 作为 key

    function updateMultiBar() {
        if (!dom.newChatPickerMultiBar) return;
        if (multiSelectMode) {
            dom.newChatPickerMultiBar.classList.remove('hidden');
            if (dom.newChatPickerMultiCount) {
                const prefix = t('new_chat_multi_selected_prefix') || '已选';
                const suffix = t('new_chat_multi_people') || '人';
                dom.newChatPickerMultiCount.textContent = `${prefix} ${selectedKeys.size} ${suffix}`.trim();
            }
        } else {
            dom.newChatPickerMultiBar.classList.add('hidden');
        }
    }

    function renderCards() {
        listContainer.innerHTML = '';

        characters.forEach(character => {
            const key = (character.name || '').trim().toLowerCase();
            const isSelected = selectedKeys.has(key);

            const card = document.createElement('div');
            card.className = `glass rounded-2xl p-3 cursor-pointer flex flex-col items-center text-center gap-2 border transition-all relative group
                ${isSelected ? 'border-amber-400 bg-amber-500/10' : 'border-white/5 hover:border-white/10 hover:bg-white/5'}`;

            const letter = character.name ? character.name.charAt(0).toUpperCase() : '?';
            const pSrc = character.previewImage || character.avatar;

            let avatarHTML;
            if (pSrc) {
                avatarHTML = `<div class="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0"><img src="${escapeHtml(pSrc)}" class="w-full h-full object-cover" alt="${escapeHtml(character.name || '')}" onerror="this.parentNode.outerHTML='<div class=\\'w-12 h-12 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-xl font-bold flex-shrink-0\\'>${letter}</div>'"></div>`;
            } else {
                avatarHTML = `<div class="w-12 h-12 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-xl font-bold flex-shrink-0">${letter}</div>`;
            }

            card.innerHTML = `
                ${avatarHTML}
                <div class="min-w-0 w-full">
                    <p class="text-sm font-medium text-zinc-100 truncate">${escapeHtml(character.name || t('char_empty_name'))}</p>
                </div>
                ${multiSelectMode ? `
                    <div class="absolute top-1 right-1 w-5 h-5 rounded-full border flex items-center justify-center text-[10px]
                        ${isSelected ? 'bg-amber-400 border-amber-300 text-black' : 'border-white/40 bg-black/30'}">
                        ${isSelected ? '✓' : ''}
                    </div>
                ` : `
                    <!-- Pure × only (no bg/rounded). Desktop: visible on group-hover.
                         Mobile: pointer-events:none → never intercepts taps; single tap on card opens chat. -->
                    <button class="char-delete-btn absolute top-1 right-1 text-white/80 hover:text-red-400 active:text-red-500 text-xl font-bold leading-none p-1 z-10 opacity-0 md:opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-all pointer-events-none group-hover:pointer-events-auto" title="删除角色卡">×</button>
                `}
            `;

            card.addEventListener('click', (e) => {
                if (!multiSelectMode) {
                    // Skip if clicking on the visible delete button (handled by its own listener).
                    // On mobile, the delete button has pointer-events:none so this guard never matches.
                    if (e.target.closest('.char-delete-btn') || e.target.closest('button[title="删除角色卡"]')) return;

                    // Single tap directly opens chat
                    newChatPickerCameFromQuick = false;
                    modal.classList.add('hidden');
                    newConversation(character);
                    return;
                }

                // 多选模式
                if (selectedKeys.has(key)) {
                    selectedKeys.delete(key);
                } else {
                    selectedKeys.add(key);
                }
                renderCards();           // 刷新选中态
                updateMultiBar();
            });

            // 删除按钮（仅非多选模式下存在）
            // Only fires on desktop hover (when pointer-events:auto via .group:hover CSS).
            // On mobile, CSS pointer-events:none prevents this handler from running.
            const delBtn = card.querySelector('.char-delete-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const displayName = character.name || '该角色卡';
                    if (!await showGlassConfirm(`\u786e\u5b9a\u4ece\u89d2\u8272\u5e93\u4e2d\u5220\u9664\u300c${displayName}\u300d\uff1f\n\u5df2\u6709\u5bf9\u8bdd\u4e2d\u7684\u89d2\u8272\u5361\u6570\u636e\u4e0d\u4f1a\u53d7\u5f71\u54cd\u3002`, { title: '\u5220\u9664\u89d2\u8272\u5361', danger: true, okText: '\u5220\u9664' })) {
                        return;
                    }
                    deleteCharacterFromLibrary(key);
                });
            }

            listContainer.appendChild(card);
        });
    }

    // 初始渲染
    renderCards();
    updateMultiBar();

    // 动态添加多选控制按钮（只添加一次）
    if (!modal._multiControlsAdded) {
        modal._multiControlsAdded = true;

        // 在底部按钮区上方插入多选切换
        const bottomArea = modal.querySelector('.mt-4.pt-4.border-t');
        if (bottomArea) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'w-full mb-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-all';
            const multiSelectText = t('new_chat_multi_select') || '多选创建群组聊天';
            const multiExitText = t('new_chat_multi_exit') || '退出多选模式';
            toggleBtn.textContent = multiSelectText;

            toggleBtn.addEventListener('click', () => {
                multiSelectMode = !multiSelectMode;
                selectedKeys.clear();
                toggleBtn.textContent = multiSelectMode ? multiExitText : multiSelectText;
                renderCards();
                updateMultiBar();

                // 动态显示/隐藏确认按钮
                let confirmBar = modal.querySelector('#newChatGroupConfirmBar');
                if (multiSelectMode) {
                    if (!confirmBar) {
                        confirmBar = document.createElement('div');
                        confirmBar.id = 'newChatGroupConfirmBar';
                        confirmBar.className = 'mt-3 flex gap-2';
                        const createGroupText = t('new_chat_create_group') || '创建群组聊天';
                        const cancelMultiText = t('new_chat_cancel_multi') || '取消';
                        confirmBar.innerHTML = `
                            <button id="newChatCreateGroupBtn"
                                    class="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all">
                                ${createGroupText}
                            </button>
                            <button id="newChatCancelMultiBtn"
                                    class="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 transition-all">
                                ${cancelMultiText}
                            </button>
                        `;
                        bottomArea.parentNode.insertBefore(confirmBar, bottomArea);

                        // 绑定确认按钮
                        const createBtn = confirmBar.querySelector('#newChatCreateGroupBtn');
                        const cancelBtn = confirmBar.querySelector('#newChatCancelMultiBtn');

                        createBtn.addEventListener('click', () => {
                            // 按用户在多选模式下的点击顺序（Set 插入顺序）构建数组，
                            // 这样 members[0] 就是用户第一个选的（开场白用它），list_order 循环也符合用户预期。
                            const keyOrder = Array.from(selectedKeys);
                            const selectedChars = keyOrder
                                .map(k => characters.find(c => (c.name || '').trim().toLowerCase() === k))
                                .filter(Boolean);
                            if (selectedChars.length >= 2) {
                                newChatPickerCameFromQuick = false;
                                modal.classList.add('hidden');
                                newConversation(selectedChars);
                            } else {
                                alert('请至少选择 2 个角色创建群组');
                            }
                        });

                        cancelBtn.addEventListener('click', () => {
                            multiSelectMode = false;
                            selectedKeys.clear();
                            toggleBtn.textContent = multiSelectText;
                            confirmBar.style.display = 'none';
                            renderCards();
                            updateMultiBar();
                        });
                    } else {
                        confirmBar.style.display = 'flex';
                    }
                } else if (confirmBar) {
                    confirmBar.style.display = 'none';
                }
            });

            bottomArea.parentNode.insertBefore(toggleBtn, bottomArea);
            modal._multiToggleBtn = toggleBtn;
        }
    }

    // If the picker was opened by clicking "创建新群聊" in the quick action dialog,
    // automatically enter multi-select mode so user doesn't have to manually click the toggle.
    if (cameFromQuick) {
        multiSelectMode = false; // ensure the upcoming click will turn it ON
        if (modal._multiToggleBtn) {
            modal._multiToggleBtn.click();
        } else {
            // fallback (should rarely happen)
            multiSelectMode = true;
            selectedKeys.clear();
            renderCards();
            updateMultiBar();
        }
        // Note: we keep the local cameFromQuick for the header "← 返回" button
        // so user can still go back to the 3-option quick menu.
    }

    // 绑定原有静态按钮（只绑定一次）
    if (!modal._wired) {
        modal._wired = true;

        dom.newChatPickerCloseBtn.addEventListener('click', () => {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
        });

        dom.newChatPickerBackdrop.addEventListener('click', () => {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
        });

        dom.newChatNoCharacterBtn.addEventListener('click', () => {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
            newConversation(null);
        });

        dom.newChatImportCharacterBtn.addEventListener('click', () => {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
            if (dom.importModal) {
                dom.importModal.classList.remove('hidden');
                dom.importStatus.classList.add('hidden');
                if (dom.importFileInput) dom.importFileInput.value = '';
            }
        });
    }

    // === Dynamic "返回上一级" button for when opened from the 3-button quick menu ===
    const header = modal.querySelector('.flex.items-center.justify-between.mb-4');
    if (header) {
        // Clean up previous back button (if re-opening)
        const prevBack = header.querySelector('#pickerBackToQuickBtn');
        if (prevBack) prevBack.remove();

        if (cameFromQuick) {
            const backBtn = document.createElement('button');
            backBtn.id = 'pickerBackToQuickBtn';
            backBtn.className = 'px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all flex-shrink-0';
            backBtn.textContent = '← 返回';
            backBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                modal.classList.add('hidden');
                newChatPickerCameFromQuick = false;
                if (typeof showQuickNewChatModal === 'function') {
                    showQuickNewChatModal();
                }
            });

            // Make header left-aligned when we have a back button
            header.classList.remove('justify-between');
            header.classList.add('justify-start', 'gap-2');

            // Insert before the title (h2)
            const titleH2 = header.querySelector('h2');
            if (titleH2) {
                header.insertBefore(backBtn, titleH2);
                titleH2.classList.add('mr-auto');  // push the close button (X) to the far right
            } else {
                header.prepend(backBtn);
            }
        }
    }

    modal.classList.remove('hidden');
}
