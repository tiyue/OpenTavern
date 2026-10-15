/**
 * 新手导读（文件：50-generation-cot-utils.js）
 *
 * 负责什么：这是“文本生成底层”中的“内容生成、思考内容、工具函数”部分。
 * 在程序中的位置：它发送模型请求、读取流式响应，并拆分正文与思考内容。
 * 从哪里开始看：主要从 `extractCotDelta(delta)`、`splitInlineCot(content, existingCot)`、`buildCotAwareParts(captureCot, content, cot)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：网络流会分成任意大小的数据块，不能假设一次读取就是完整 JSON 或完整句子。
 */
// ==================== Generation CoT Helpers ====================
function extractCotDelta(delta) {
    if (!delta) return '';
    var val = delta.reasoning_content || delta.reasoning || delta.thinking || delta.cot;
    if (typeof val === 'string') return val;
    if (val && typeof val.content === 'string') return val.content;
    if (Array.isArray(val)) {
        return val.map(function(part) {
            if (typeof part === 'string') return part;
            return part && (part.text || part.content) ? String(part.text || part.content) : '';
        }).join('');
    }
    return '';
}

function splitInlineCot(content, existingCot) {
    var text = String(content || '');
    var cot = String(existingCot || '');
    var re = /<think(?:ing)?\b[^>]*>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi;
    var match;
    while ((match = re.exec(text)) !== null) {
        if (match[1]) cot += (cot ? '\n' : '') + match[1].trim();
    }
    text = text.replace(re, '').trim();
    return { content: text, cot: cot.trim() };
}

function buildCotAwareParts(captureCot, content, cot) {
    return captureCot
        ? splitInlineCot(content || '', cot || '')
        : { content: content || '', cot: '' };
}
