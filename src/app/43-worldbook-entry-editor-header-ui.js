// ==================== World Book Entry Editor Header UI ====================
function updateWorldBookModalHeader() {
    const titleEl = document.querySelector('#worldBookModal .font-bold.text-lg');
    if (!titleEl) return;

    if (wiState.currentWorldBookId) {
        const wb = state.worldBooks && state.worldBooks[wiState.currentWorldBookId];
        titleEl.textContent = wb ? `世界书：${wb.name || '未命名'}` : '世界书管理器';
    } else {
        titleEl.textContent = '世界书管理器（全局）';
    }
}
