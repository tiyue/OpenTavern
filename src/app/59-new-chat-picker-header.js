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
