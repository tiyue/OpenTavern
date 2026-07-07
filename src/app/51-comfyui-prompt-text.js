// ==================== ComfyUI Prompt Text ====================
function buildComfyPromptText(conv) {
    ensureComfySettings();
    var latestAssistant = '';
    if (conv && Array.isArray(conv.messages)) {
        for (var i = conv.messages.length - 1; i >= 0; i--) {
            if (conv.messages[i] && conv.messages[i].role === 'assistant' && conv.messages[i].content) {
                latestAssistant = conv.messages[i].content;
                break;
            }
        }
    }
    var inputText = dom.messageInput ? dom.messageInput.value.trim() : '';
    var scene = inputText || latestAssistant || (conv && conv.title) || '';
    var character = '';
    if (conv) {
        if (isGroupChat(conv)) {
            character = getGroupMembers(conv).map(function(m) {
                return m && m.character ? m.character.name : '';
            }).filter(Boolean).join(', ');
        } else if (conv.character && conv.character.name) {
            character = conv.character.name;
        }
    }
    var text = state.settings.comfyPromptTemplate || '{{scene}}';
    text = text.replace(/\{\{scene\}\}/gi, scene)
        .replace(/\{\{last_assistant\}\}/gi, latestAssistant)
        .replace(/\{\{input\}\}/gi, inputText)
        .replace(/\{\{char\}\}/gi, character)
        .replace(/\{\{user\}\}/gi, state.settings.userName || 'User');
    return text.trim() || scene || character || 'roleplay scene';
}
