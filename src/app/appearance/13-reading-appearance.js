var READING_WIDTHS = { narrow: '38em', medium: '46em', wide: '60em', full: '' };
var READING_FONT_SIZES = ['default', '14', '15', '16', '18'];

function isSafeChatBackground(value) {
    return value === '' || (typeof value === 'string' && value.length <= 2800000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value));
}

function ensureReadingAppearanceSettings(settings) {
    if (!Object.prototype.hasOwnProperty.call(READING_WIDTHS, settings.readingWidth)) settings.readingWidth = 'medium';
    if (!READING_FONT_SIZES.includes(String(settings.readingFontSize))) settings.readingFontSize = 'default';
    settings.readingFontSize = String(settings.readingFontSize);
    if (typeof settings.restoreLastChat !== 'boolean') settings.restoreLastChat = false;
    if (!isSafeChatBackground(settings.chatBackground)) settings.chatBackground = '';
    return settings;
}

function applyReadingAppearance(settings) {
    settings = settings || state.settings;
    if (!dom.messagesContainer) return;
    var width = READING_WIDTHS[settings.readingWidth || 'medium'];
    dom.messagesContainer.style.setProperty('padding-inline', width ? 'max(12px, calc((100% - ' + width + ') / 2))' : '12px', 'important');
    if (READING_FONT_SIZES.includes(String(settings.readingFontSize)) && settings.readingFontSize !== 'default') dom.messagesContainer.style.setProperty('--chat-reading-font', settings.readingFontSize + 'px');
    else dom.messagesContainer.style.removeProperty('--chat-reading-font');
    var background = isSafeChatBackground(settings.chatBackground) ? settings.chatBackground : '';
    if (background) dom.messagesContainer.style.setProperty('background-image', 'linear-gradient(var(--chat-background-mask), var(--chat-background-mask)), url("' + background + '")', 'important');
    else dom.messagesContainer.style.removeProperty('background-image');
}
