var readingBackgroundSequence = 0;

function hydrateReadingAppearanceSettings() {
    var settings = getSettingsFormTarget();
    document.getElementById('readingWidth').value = settings.readingWidth || 'medium';
    document.getElementById('readingFontSize').value = settings.readingFontSize || 'default';
    document.getElementById('restoreLastChat').checked = settings.restoreLastChat === true;
    updateReadingBackgroundStatus();
}

function readReadingAppearanceSettingsFromForm(target) {
    target.readingWidth = document.getElementById('readingWidth').value;
    target.readingFontSize = document.getElementById('readingFontSize').value;
    target.restoreLastChat = document.getElementById('restoreLastChat').checked;
}

function updateReadingBackgroundStatus(message) {
    var target = document.getElementById('chatBackgroundStatus');
    if (target) target.textContent = message || (getSettingsFormTarget().chatBackground ? '已选择背景，完成后保存' : '未设置背景');
}

function previewReadingAppearance() {
    if (!settingsFormDraft) return;
    readReadingAppearanceSettingsFromForm(settingsFormDraft);
    settingsFormDraft.uiTheme = dom.uiTheme.value;
    applyUiTheme(settingsFormDraft.uiTheme, { cache: false });
    applyReadingAppearance(settingsFormDraft);
}

async function importChatBackground(file) {
    var target = settingsFormDraft, sequence = ++readingBackgroundSequence;
    if (!target || !file) return;
    try {
        if (file.size > 2 * 1024 * 1024) throw new Error('背景图片不能超过 2 MiB。');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
        var header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        var png = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
        var jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
        var webp = String.fromCharCode.apply(null, header.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, header.slice(8, 12)) === 'WEBP';
        if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('图片格式与文件内容不符。');
        var data = await new Promise(function(resolve, reject) { var reader = new FileReader(); reader.onload = function() { resolve(reader.result); }; reader.onerror = function() { reject(new Error('图片读取失败。')); }; reader.readAsDataURL(file); });
        var image = new Image(); image.src = data; await image.decode();
        if (image.naturalWidth > 4096 || image.naturalHeight > 4096 || image.naturalWidth * image.naturalHeight > 16000000) throw new Error('背景最长边不能超过 4096 像素。');
        if (!isSafeChatBackground(data)) throw new Error('背景数据不可用。');
        if (settingsFormDraft !== target || sequence !== readingBackgroundSequence) return;
        target.chatBackground = data; previewReadingAppearance(); updateReadingBackgroundStatus();
    } catch (error) { if (settingsFormDraft === target && sequence === readingBackgroundSequence) updateReadingBackgroundStatus(error.message); }
}

function bindReadingAppearanceEvents() {
    ['readingWidth', 'readingFontSize', 'uiTheme'].forEach(function(id) { document.getElementById(id).addEventListener('change', previewReadingAppearance); });
    document.getElementById('chatBackgroundChoose').onclick = function() { document.getElementById('chatBackgroundFile').click(); };
    document.getElementById('chatBackgroundFile').onchange = function(event) { var file = event.target.files[0]; if (file) importChatBackground(file); event.target.value = ''; };
    document.getElementById('chatBackgroundClear').onclick = function() { readingBackgroundSequence++; if (settingsFormDraft) settingsFormDraft.chatBackground = ''; previewReadingAppearance(); updateReadingBackgroundStatus(); };
}
