// ==================== New Chat World Info Helpers ====================
function copyWorldInfoFromCurrentConversation(conv, current) {
    if (current && current.worldInfo) {
        conv.worldInfo = JSON.parse(JSON.stringify(current.worldInfo));
    }
}
