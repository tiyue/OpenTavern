/**
 * 新手导读（文件：59-new-chat-picker-header.js）
 *
 * 负责什么：这是“新建聊天流程”中的“新建、聊天、选择器、标题区域”部分。
 * 在程序中的位置：它处理角色选择、群聊多选、首条消息、世界书关联和会话归档。
 * 从哪里开始看：主要从 `resetNewChatPickerHeader(modal)`、`updateNewChatPickerBackButton(modal, cameFromQuick)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：新会话只有在角色与初始数据准备完成后才能保存和切换。
 */
// ==================== New Chat Picker Header Helpers ====================
function resetNewChatPickerHeader(modal) {
    var header = modal.querySelector('.flex.items-center.mb-4') || (modal.querySelector('h2') && modal.querySelector('h2').parentElement);
    if (!header) return;

    header.classList.remove('justify-start', 'gap-2');
    header.classList.add('justify-between');

    var oldTitle = header.querySelector('h2');
    if (oldTitle) oldTitle.classList.remove('mr-auto');
}

function updateNewChatPickerBackButton(modal, cameFromQuick) {
    var header = modal.querySelector('.flex.items-center.justify-between.mb-4');
    if (!header) return;

    var prevBack = header.querySelector('#pickerBackToQuickBtn');
    if (prevBack) prevBack.remove();
    if (!cameFromQuick) return;

    var backBtn = document.createElement('button');
    backBtn.id = 'pickerBackToQuickBtn';
    backBtn.className = 'px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/15 active:bg-white/20 transition-all flex-shrink-0';
    backBtn.textContent = '← 返回';
    backBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        modal.classList.add('hidden');
        newChatPickerCameFromQuick = false;
        if (typeof showQuickNewChatModal === 'function') {
            showQuickNewChatModal();
        }
    });

    header.classList.remove('justify-between');
    header.classList.add('justify-start', 'gap-2');

    var titleH2 = header.querySelector('h2');
    if (titleH2) {
        header.insertBefore(backBtn, titleH2);
        titleH2.classList.add('mr-auto');
    } else {
        header.prepend(backBtn);
    }
}
