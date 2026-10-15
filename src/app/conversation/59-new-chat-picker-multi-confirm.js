/**
 * 新手导读（文件：59-new-chat-picker-multi-confirm.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、多选、确认”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `syncNewChatPickerGroupConfirmBar(session)`、`createNewChatPickerGroupConfirmBar(modal)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Multi-select Confirm Bar ====================
function syncNewChatPickerGroupConfirmBar(session) {
    const modal = session.modal;
    const bottomArea = modal._multiBottomArea;
    if (!bottomArea) return;

    let confirmBar = modal.querySelector('#newChatGroupConfirmBar');
    if (session.multiSelectMode) {
        if (!confirmBar) {
            confirmBar = createNewChatPickerGroupConfirmBar(modal);
            bottomArea.parentNode.insertBefore(confirmBar, bottomArea);
        }
        confirmBar.style.display = 'flex';
    } else if (confirmBar) {
        confirmBar.style.display = 'none';
    }
}

function createNewChatPickerGroupConfirmBar(modal) {
    const confirmBar = document.createElement('div');
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

    confirmBar.querySelector('#newChatCreateGroupBtn').addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (!session) return;

        const selectedChars = getNewChatPickerSelectedCharacters(session);
        if (selectedChars.length >= 2) {
            newChatPickerCameFromQuick = false;
            modal.classList.add('hidden');
            newConversation(selectedChars);
        } else {
            alert('请至少选择 2 个角色创建群组');
        }
    });

    confirmBar.querySelector('#newChatCancelMultiBtn').addEventListener('click', () => {
        const session = modal._newChatPickerSession;
        if (session) setNewChatPickerMultiMode(session, false);
    });

    return confirmBar;
}
