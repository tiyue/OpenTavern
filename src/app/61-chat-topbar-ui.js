/**
 * 新手导读（文件：61-chat-topbar-ui.js）
 *
 * 负责什么：这是“聊天消息渲染”中的“聊天、顶部栏、界面”部分。
 * 在程序中的位置：它把会话消息转换为气泡、状态栏、附件、思考块和二段选项。
 * 从哪里开始看：主要从 `renderTopBar(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：模型文本属于外部内容，插入 HTML 前必须经过统一转义或安全格式化。
 */
// ==================== Chat Top Bar UI ====================
function renderTopBar() {
    var conv = getActiveConv();
    if (!conv) return;
    if (dom.chatTitle) dom.chatTitle.textContent = conv.title || t('new_chat_title');

    if (isGroupChat(conv)) {
        const members = getGroupMembers(conv);
        if (dom.charAvatar) {
            dom.charAvatar.textContent = 'Group';
            dom.charAvatar.className = 'w-9 h-9 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-sm font-bold flex-shrink-0';
        }
        if (dom.chatSubtitle) {
            const names = members.map(m => (m.character && m.character.name) ? m.character.name : '').filter(Boolean).slice(0, 3).join('、');
            dom.chatSubtitle.textContent = names + (members.length > 3 ? ' 等' : '') || (t('no_character') || '群聊');
        }
        return;
    }

    if (conv.character) {
        const ch = conv.character;
        const src = ch.previewImage || ch.avatar;
        if (dom.charAvatar) {
            if (src) {
                dom.charAvatar.innerHTML = `<img src="${src}" class="w-full h-full object-cover rounded-xl" alt="${ch.name || ''}">`;
                dom.charAvatar.className = 'w-9 h-9 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 border border-white/10';
            } else {
                dom.charAvatar.textContent = ch.name.charAt(0).toUpperCase();
                dom.charAvatar.className = 'w-9 h-9 rounded-xl ot-avatar-fill flex items-center justify-center text-white text-sm font-bold flex-shrink-0';
            }
        }
        if (dom.chatSubtitle) {
            var sep = t('char_tag_separator');
            dom.chatSubtitle.textContent = conv.character.tags ? conv.character.tags.slice(0,3).join(sep) : conv.character.name;
        }
    } else {
        if (dom.charAvatar) {
            dom.charAvatar.textContent = 'Chat';
            dom.charAvatar.className = 'w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-zinc-500 text-sm flex-shrink-0';
        }
        if (dom.chatSubtitle) dom.chatSubtitle.textContent = t('no_character');
    }
}
