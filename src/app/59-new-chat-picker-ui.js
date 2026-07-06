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

    resetNewChatPickerHeader(modal);

    listContainer.innerHTML = '';

    const characters = getAllAvailableCharacters();
    let multiSelectMode = false;
    const selectedKeys = new Set(); // 使用 name.toLowerCase() 作为 key

    function updateMultiBar() {
        updateNewChatPickerMultiBar(multiSelectMode, selectedKeys.size);
    }

    function renderCards() {
        listContainer.innerHTML = '';

        characters.forEach(character => {
            const key = getNewChatPickerCharacterKey(character);
            const card = createNewChatPickerCharacterCard(character, {
                isSelected: selectedKeys.has(key),
                multiSelectMode: multiSelectMode,
                onOpen: function(ch) {
                    newChatPickerCameFromQuick = false;
                    modal.classList.add('hidden');
                    newConversation(ch);
                },
                onToggle: function(selectedKey) {
                    if (selectedKeys.has(selectedKey)) {
                        selectedKeys.delete(selectedKey);
                    } else {
                        selectedKeys.add(selectedKey);
                    }
                    renderCards();
                    updateMultiBar();
                }
            });

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
    bindNewChatPickerStaticButtons(modal);
    updateNewChatPickerBackButton(modal, cameFromQuick);

    modal.classList.remove('hidden');
}
