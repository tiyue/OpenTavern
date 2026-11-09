// 用户图片保存在消息附件中；未发送草稿按会话对象隔离，只存在当前页面内存。
var COMPOSER_IMAGE_MAX_COUNT = 4;
var COMPOSER_IMAGE_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
var COMPOSER_IMAGE_MAX_EDGE = 1280;
var COMPOSER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
var composerDrafts = new WeakMap();
var composerDraftConversation = null;
var composerSendInProgress = false;

function getMessagePlainText(content) {
    if (!Array.isArray(content)) return content == null ? '' : String(content);
    return content.filter(function(part) { return part && part.type === 'text'; }).map(function(part) { return String(part.text || ''); }).join('');
}

function clonePromptContent(content) {
    return Array.isArray(content) ? JSON.parse(JSON.stringify(content)) : String(content == null ? '' : content);
}

function mergePromptContents(left, right) {
    if (!Array.isArray(left) && !Array.isArray(right)) return left + '\n\n' + right;
    function parts(value) { return Array.isArray(value) ? clonePromptContent(value) : [{ type: 'text', text: String(value || '') }]; }
    return parts(left).concat([{ type: 'text', text: '\n\n' }], parts(right));
}

function getUserVisionAttachments(message) {
    return message && message.role === 'user' && Array.isArray(message.attachments) ? message.attachments.filter(function(att) {
        return att && att.type === 'image' && att.source === 'user';
    }) : [];
}

function validateUserImageAttachments(message) {
    var images = getUserVisionAttachments(message);
    if (images.length > COMPOSER_IMAGE_MAX_COUNT) throw new Error('每条消息最多包含 4 张用户图片。');
    images.forEach(function(att) {
        var match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(att.dataUrl || ''));
        if (!match || match[2].length % 4 || match[2].length > Math.ceil(COMPOSER_IMAGE_MAX_BYTES / 3) * 4) throw new Error('用户图片须为不超过 2 MiB 的本地 PNG、JPEG、WebP 或 GIF。');
        var bytes;
        try { bytes = atob(match[2]); } catch (_) { throw new Error('用户图片编码无效。'); }
        var raw = Uint8Array.from(bytes, function(char) { return char.charCodeAt(0); });
        var mime = detectPrivateMediaSignatureMime(raw);
        if (mime !== 'image/' + match[1] || att.mime && att.mime !== mime || bytes.length > COMPOSER_IMAGE_MAX_BYTES) throw new Error('用户图片格式与内容不符。');
    });
    return images;
}

function buildMultimodalUserContent(text, images) {
    var parts = [];
    if (String(text || '').trim()) parts.push({ type: 'text', text: String(text) });
    (images || []).forEach(function(att) { parts.push({ type: 'image_url', image_url: { url: att.dataUrl } }); });
    return parts.length ? parts : String(text || '');
}

function applyUserImagesToApiMessages(messages, maxImages) {
    var remaining = maxImages || COMPOSER_IMAGE_MAX_COUNT;
    return messages.slice().reverse().map(function(message) {
        var images = message._userImages || [];
        var selected = images.slice(Math.max(0, images.length - remaining));
        remaining = Math.max(0, remaining - selected.length);
        var content = message.content;
        if (selected.length) content = buildMultimodalUserContent(content, selected);
        else if (images.length && !String(content || '').trim()) content = '[较早的用户图片已超出本次图片窗口]';
        return { role: message.role, content: content };
    }).reverse();
}

function getComposerDraft(conv) {
    if (!conv) return null;
    var draft = composerDrafts.get(conv);
    if (!draft) {
        draft = { text: '', images: [], pending: 0, revision: 0, notice: '' };
        composerDrafts.set(conv, draft);
    }
    return draft;
}

function syncComposerConversation() {
    var conv = getActiveConv();
    if (composerDraftConversation === conv) return;
    if (composerDraftConversation) getComposerDraft(composerDraftConversation).text = dom.messageInput.value;
    composerDraftConversation = conv;
    var draft = getComposerDraft(conv);
    dom.messageInput.value = draft ? draft.text : '';
    dom.messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    renderComposerImages();
}

function renderComposerImages() {
    var host = document.getElementById('composerImagePreview');
    var status = document.getElementById('composerImageStatus');
    var draft = getComposerDraft(getActiveConv());
    if (!host || !draft) return;
    host.replaceChildren();
    host.hidden = !draft.images.length;
    draft.images.forEach(function(item) {
        var wrapper = document.createElement('div'); wrapper.className = 'composer-image-thumb';
        var image = document.createElement('img'); image.src = item.dataUrl; image.alt = item.name || '用户图片';
        var remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
        remove.setAttribute('aria-label', '移除图片 ' + (item.name || ''));
        remove.disabled = composerSendInProgress || state.isGenerating;
        remove.addEventListener('click', function() {
            draft.images.splice(draft.images.indexOf(item), 1); draft.revision++;
            if (typeof cancelUserDraft === 'function') cancelUserDraft();
            renderComposerImages();
        });
        wrapper.append(image, remove); host.appendChild(wrapper);
    });
    if (status) status.textContent = draft.pending ? '正在处理图片…' : draft.notice || (draft.images.length ? draft.images.length + '/4 张 · 需视觉模型' : '最多 4 张 · 需视觉模型');
    updateComposerImagesState();
}

function updateComposerImagesState() {
    var button = document.getElementById('composerImageBtn');
    var draft = getComposerDraft(getActiveConv());
    var busy = composerSendInProgress || state.isGenerating;
    if (button) button.disabled = !draft || busy || draft.images.length + draft.pending >= COMPOSER_IMAGE_MAX_COUNT;
    if (composerSendInProgress || draft && draft.pending) {
        dom.sendBtn.disabled = true;
        if (composerSendInProgress) dom.messageInput.disabled = true;
    }
}

function notifyComposerImageDraft(conv, message) {
    var draft = getComposerDraft(conv); draft.notice = message;
    if (getActiveConv() === conv) renderComposerImages();
}

async function prepareComposerImage(file) {
    if (!file || !file.size || file.size > COMPOSER_IMAGE_MAX_SOURCE_BYTES) throw new Error('原图须大于 0 且不超过 15 MiB。');
    var raw = new Uint8Array(await file.arrayBuffer());
    var mime = detectPrivateMediaSignatureMime(raw);
    if (!mime || file.type && file.type !== mime && !(file.type === 'image/jpg' && mime === 'image/jpeg')) throw new Error('请选择内容有效的 PNG、JPEG、WebP 或 GIF 图片。');
    var objectUrl = URL.createObjectURL(new Blob([raw], { type: mime }));
    try {
        var image = new Image(); image.src = objectUrl; await image.decode();
        var width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height || width > 16384 || height > 16384 || width * height > 40000000) throw new Error('原图不能超过 40 MP 或单边 16384 像素。');
        var scale = Math.min(1, COMPOSER_IMAGE_MAX_EDGE / Math.max(width, height));
        var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
        var context = canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法处理图片。');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        var bytes = atob(dataUrl.split(',')[1] || '').length;
        if (!/^data:image\/jpeg;base64,/.test(dataUrl) || bytes > COMPOSER_IMAGE_MAX_BYTES) throw new Error('处理后的图片超过 2 MiB。');
        return { type: 'image', source: 'user', mime: 'image/jpeg', dataUrl: dataUrl, name: String(file.name || '图片').slice(0, 255), width: canvas.width, height: canvas.height, bytes: bytes, createdAt: Date.now() };
    } finally { if (canvas) canvas.width = canvas.height = 1; URL.revokeObjectURL(objectUrl); }
}

async function addComposerImageFiles(fileList) {
    syncComposerConversation();
    var conv = getActiveConv(), draft = getComposerDraft(conv);
    if (!draft || state.isGenerating || composerSendInProgress) return;
    var files = Array.from(fileList || []);
    var remaining = COMPOSER_IMAGE_MAX_COUNT - draft.images.length - draft.pending;
    var selected = files.slice(0, Math.max(0, remaining));
    draft.notice = files.length > remaining ? '每条消息最多 4 张图片。' : '';
    draft.pending += selected.length; draft.revision++; renderComposerImages();
    for (var file of selected) {
        try {
            var image = await prepareComposerImage(file);
            if (isLiveConversation(conv) && composerDrafts.get(conv) === draft) {
                draft.images.push(image); draft.revision++;
                if (typeof cancelUserDraft === 'function') cancelUserDraft();
            }
        } catch (error) { draft.notice = error.message || '图片读取失败。'; }
        finally {
            draft.pending--;
            if (getActiveConv() === conv) { updateInputState(); renderComposerImages(); }
        }
    }
}

function captureComposerMessage(conv) {
    syncComposerConversation();
    var draft = getComposerDraft(conv);
    if (!draft || draft.pending) return null;
    draft.text = dom.messageInput.value;
    var capture = { draft: draft, revision: draft.revision, text: draft.text.trim(), attachments: JSON.parse(JSON.stringify(draft.images)) };
    validateUserImageAttachments({ role: 'user', attachments: capture.attachments });
    return capture;
}

function clearCommittedComposerMessage(conv, capture) {
    var draft = getComposerDraft(conv);
    if (draft !== capture.draft || draft.revision !== capture.revision || draft.text.trim() !== capture.text) return;
    draft.images = []; draft.text = ''; draft.notice = ''; draft.revision++;
    if (getActiveConv() === conv) { resetMessageComposerInput(); renderComposerImages(); }
}

function bindComposerImageEvents() {
    var button = document.getElementById('composerImageBtn');
    var picker = document.getElementById('composerImageInput');
    var composer = document.getElementById('chatComposer');
    if (!button || !picker || !composer) return;
    composerDraftConversation = getActiveConv();
    if (composerDraftConversation) getComposerDraft(composerDraftConversation).text = dom.messageInput.value;
    button.addEventListener('click', function() { picker.value = ''; picker.click(); });
    picker.addEventListener('change', function() { addComposerImageFiles(picker.files); picker.value = ''; });
    dom.messageInput.addEventListener('input', function() {
        var draft = getComposerDraft(composerDraftConversation);
        if (draft) { draft.text = dom.messageInput.value; draft.revision++; }
    });
    dom.messageInput.addEventListener('paste', function(event) {
        var data = event.clipboardData;
        var files = data && Array.from(data.files || []).filter(function(file) { return /^image\//.test(file.type); });
        if (!files || !files.length) return;
        event.preventDefault(); addComposerImageFiles(files);
    });
    composer.addEventListener('dragover', function(event) {
        if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) event.preventDefault();
    });
    composer.addEventListener('drop', function(event) {
        if (!event.dataTransfer || !event.dataTransfer.files.length) return;
        event.preventDefault(); addComposerImageFiles(event.dataTransfer.files);
    });
    appStore.subscribe(function() { syncComposerConversation(); updateComposerImagesState(); });
    renderComposerImages();
}
