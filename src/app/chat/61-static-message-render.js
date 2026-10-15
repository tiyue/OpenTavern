var staticMessageMarkdown;

function safeMessageLink(href) {
    try {
        var url = new URL(href, document.baseURI);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
}

function renderStaticMessage(text) {
    if (!window.marked || !window.DOMPurify || text.length > 500000) return highlightDialogue(text);
    var unsupported = new Set();
    if (!staticMessageMarkdown) {
        staticMessageMarkdown = new marked.Marked({ gfm: true, breaks: true, async: false });
    }
    var renderer = new marked.Renderer();
    renderer.image = function(token) {
        var href = safeMessageLink(token.href);
        return href ? '<a href="' + escapeHtml(href) + '">[图片：' + escapeHtml(token.text || '打开') + ']</a>' : escapeHtml(token.text || '[图片]');
    };
    renderer.checkbox = function(token) { return token.checked ? '[x] ' : '[ ] '; };
    renderer.html = function(token) {
        if (/<\/?(?:initvar|UpdateVariable|JSONPatch)\b|<%[\s\S]*?%>/i.test(token.text)) {
            unsupported.add('MVU 更新或模板');
            return '<pre><code>' + escapeHtml(token.text) + '</code></pre>';
        }
        if (/<\/?(?:script|style|iframe|object|embed|form|input|button|svg|math|audio|video|img)\b|\s(?:style|on\w+)\s*=/i.test(token.text)) unsupported.add('脚本、样式或嵌入资源');
        return token.text;
    };
    var generated;
    try { generated = staticMessageMarkdown.parse(text, { renderer: renderer }); } catch (_) { return highlightDialogue(text); }
    var fragment = DOMPurify.sanitize(generated, {
        RETURN_DOM_FRAGMENT: true,
        ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'details', 'summary', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption'],
        ALLOWED_ATTR: ['href', 'title', 'open', 'colspan', 'rowspan', 'scope', 'start'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'img', 'audio', 'video', 'svg', 'math', 'link', 'base'],
        FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math']
    });
    fragment.querySelectorAll('a').forEach(function(link) {
        var href = safeMessageLink(link.getAttribute('href') || '');
        if (!href || !link.hasAttribute('href')) { link.replaceWith(document.createTextNode(link.textContent)); return; }
        link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
    });
    fragment.querySelectorAll('table').forEach(function(table) { var wrapper = document.createElement('div'); wrapper.className = 'message-table-scroll'; table.replaceWith(wrapper); wrapper.appendChild(table); });
    fragment.querySelectorAll('details').forEach(function(details) {
        details.className = 'status-bar';
        var content = document.createElement('div'); content.className = 'status-bar-content';
        Array.from(details.childNodes).forEach(function(child) { if (child.nodeName !== 'SUMMARY') content.appendChild(child); });
        details.appendChild(content);
    });
    var walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT), nodes = [], node;
    while ((node = walker.nextNode())) if (!node.parentElement || !node.parentElement.closest('pre,code')) nodes.push(node);
    nodes.forEach(function(textNode) {
        if (!/[“「]/.test(textNode.textContent)) return;
        var holder = document.createElement('span'); holder.innerHTML = highlightDialogue(textNode.textContent); textNode.replaceWith(holder);
    });
    var result = document.createElement('div'); result.className = 'message-rich-text'; result.appendChild(fragment);
    if (unsupported.size) { var notice = document.createElement('p'); notice.className = 'message-content-notice'; notice.textContent = '静态显示：' + Array.from(unsupported).join('、') + '尚未支持。原文保留在消息中。'; result.appendChild(notice); }
    return result.outerHTML;
}
