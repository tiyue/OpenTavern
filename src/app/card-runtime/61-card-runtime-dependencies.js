// Downloads are preparation only. No downloaded card code executes in the host.
// 固定依赖使用统一的运行时资源定位入口：有版本快照时命中不可变本地镜像，否则保留原相对地址。
function cardRuntimeVendorUrl(vendorPath) {
    return typeof getRuntimeAssetUrl === 'function' ? getRuntimeAssetUrl(vendorPath) : vendorPath;
}

async function cardRuntimeDigest(text) {
    var bytes = new TextEncoder().encode(String(text));
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        var digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }
    if (typeof window.sha256 !== 'function') throw new Error('SHA-256 依赖不可用。');
    return window.sha256(bytes);
}

// 只有两个官方 ESM 别名映射到已入库的字节一致本地镜像；不把经典脚本换成 ESM，也不拦截其它外部请求。
var CARD_RUNTIME_ESM_MIRRORS = {
    'https://cdn.jsdelivr.net/npm/vue@3.5.43/dist/vue.esm-browser.prod.js': 'vue-esm',
    'https://cdn.jsdelivr.net/npm/js-yaml@4.1.1/dist/js-yaml.mjs': 'js-yaml-esm'
};

function cardRuntimeEsmMirror(url) {
    var name = Object.prototype.hasOwnProperty.call(CARD_RUNTIME_ESM_MIRRORS, url) ? CARD_RUNTIME_ESM_MIRRORS[url] : '';
    if (!name) return null;
    return CARD_RUNTIME_VENDORS.find(function(item) { return item.name === name; }) || null;
}

async function readCardRuntimeDependency(url, signal, limit) {
    var address = new URL(url, document.baseURI);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password) throw new Error('依赖地址须为不含凭据的 HTTP 或 HTTPS 地址。');
    var mirror = cardRuntimeEsmMirror(address.href);
    var target = mirror ? new URL(cardRuntimeVendorUrl(mirror.path), document.baseURI) : address;
    var controller = new AbortController(), total = 0, reader;
    function cancel() { controller.abort(); }
    if (signal) { if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true }); }
    var timeout = setTimeout(cancel, 12000);
    try {
        var response = await fetch(target.href, { signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (!response.ok || !response.body) throw new Error('依赖下载失败：' + response.status + ' ' + address.origin);
        if (Number(response.headers.get('content-length')) > limit) throw new Error('依赖超过大小限制。');
        reader = response.body.getReader();
        var chunks = [];
        while (true) {
            var part = await reader.read();
            if (part.done) break;
            total += part.value.byteLength;
            if (total > limit) throw new Error('依赖超过大小限制。');
            chunks.push(part.value);
        }
        var bytes = new Uint8Array(total), offset = 0;
        chunks.forEach(function(chunk) { bytes.set(chunk, offset); offset += chunk.length; });
        var text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (mirror && await cardRuntimeDigest(text) !== mirror.sha256) throw new Error('固定依赖摘要不符：' + mirror.name);
        return text;
    } finally {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', cancel);
        if (reader) await reader.cancel().catch(function() {});
        controller.abort();
    }
}

async function loadCardRuntimeDependencies(level, signal) {
    var names = level === 'L0' ? [] : ['lodash', 'jquery'];
    if (level === 'L2' || level === 'L3') names = names.concat(['vue', 'js-yaml']);
    var results = [];
    for (var name of names) {
        var vendor = CARD_RUNTIME_VENDORS.find(function(item) { return item.name === name; });
        var source = await readCardRuntimeDependency(cardRuntimeVendorUrl(vendor.path), signal, 3 * 1024 * 1024);
        if (await cardRuntimeDigest(source) !== vendor.sha256) throw new Error('固定依赖摘要不符：' + name);
        results.push({ name: name + '@' + vendor.version, url: vendor.url, source: source, sha256: vendor.sha256, type: 'classic', inject: true });
    }
    return results;
}

var cardRuntimeLexerPromise;
async function loadCardRuntimeLexer(signal) {
    if (!cardRuntimeLexerPromise) {
        cardRuntimeLexerPromise = (async function() {
            var vendor = CARD_RUNTIME_VENDORS.find(function(item) { return item.name === 'es-module-lexer'; });
            var source = await readCardRuntimeDependency(cardRuntimeVendorUrl(vendor.path), signal, 256 * 1024);
            if (await cardRuntimeDigest(source) !== vendor.sha256) throw new Error('模块解析器摘要不符。');
            var url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            try { var lexer = await import(url); await lexer.init; return lexer; }
            finally { URL.revokeObjectURL(url); }
        })().catch(function(error) { cardRuntimeLexerPromise = null; throw error; });
    }
    return cardRuntimeLexerPromise;
}

function resolveCardRuntimeImport(specifier, base) {
    var aliases = {
        vue: 'https://cdn.jsdelivr.net/npm/vue@3.5.43/dist/vue.esm-browser.prod.js',
        'js-yaml': 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.1/dist/js-yaml.mjs'
    };
    if (Object.prototype.hasOwnProperty.call(aliases, specifier)) return aliases[specifier];
    if (!/^(?:https?:\/\/|\.\.?\/|\/)/.test(specifier)) throw new Error('不支持未固定的裸模块：' + specifier);
    var url = new URL(specifier, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模块地址须为 HTTP 或 HTTPS。');
    return url.href;
}

function cardRuntimeFixedVendor(url) {
    var patterns = {
        jquery: /^https:\/\/(?:code\.jquery\.com\/jquery-3\.7\.1(?:\.min)?\.js|cdn\.jsdelivr\.net\/npm\/jquery@3\.7\.1\/dist\/jquery(?:\.min)?\.js|unpkg\.com\/jquery@3\.7\.1\/dist\/jquery(?:\.min)?\.js)$/,
        lodash: /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/lodash@4\.\d+\.\d+\/lodash(?:\.min)?\.js$/,
        vue: /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/vue@3\.\d+\.\d+\/dist\/vue\.global(?:\.prod)?\.js$/,
        'js-yaml': /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/js-yaml@4\.\d+\.\d+\/dist\/js-yaml(?:\.min)?\.js$/
    };
    return Object.keys(patterns).find(function(name) { return patterns[name].test(url); }) || '';
}

async function prepareCardRuntimeExecution(source, level, options) {
    options = options || {};
    if (!['L0', 'L1', 'L2', 'L3'].includes(level)) throw new Error('运行级别无效。');
    if (options.signal && options.signal.aborted) throw new Error('依赖审核已取消。');
    if (level === 'L3') {
        var broker = new URL(options.network && options.network.brokerUrl || '', document.baseURI);
        if (!['http:', 'https:'].includes(broker.protocol) || broker.origin === location.origin || broker.username || broker.password) throw new Error('联网运行服务须使用与应用不同源的 HTTP 或 HTTPS 地址。');
    }
    var template = document.createElement('template'); template.innerHTML = source;
    var scripts = await loadCardRuntimeDependencies(level, options.signal), modules = [], queue = [], total = 0;
    var nodes = Array.from(template.content.querySelectorAll('script'));
    if (nodes.length > 32) throw new Error('卡片脚本不能超过 32 项。');
    if (template.content.querySelector('base,iframe,object,embed')) throw new Error('卡片包含不支持的嵌入或基址元素。');
    if (template.content.querySelector('script[type="importmap"]')) throw new Error('卡片自带 importmap 尚不支持；请使用固定 URL 模块。');
    var lexer = null, moduleIds = new Map();
    function enqueue(url) {
        if (!moduleIds.has(url)) {
            if (moduleIds.size >= 48) throw new Error('模块闭包不能超过 48 项。');
            moduleIds.set(url, 'card-runtime:module-' + moduleIds.size); queue.push(url);
        }
        return moduleIds.get(url);
    }
    async function rewrite(text, base) {
        lexer = lexer || await loadCardRuntimeLexer(options.signal);
        var imports = lexer.parse(text)[0], changes = [];
        if (imports.length && (level === 'L0' || level === 'L1')) throw new Error('模块需要 L2 依赖下载审核。');
        for (var item of imports) {
            if (typeof item.a === 'number' && item.a >= 0) throw new Error('首批只支持 JavaScript 模块，不支持带类型属性的导入。');
            if (item.d === -2) {
                changes.push({ start: item.s, end: item.e, text: '({url:' + JSON.stringify(base) + '})' });
                continue;
            }
            if (typeof item.n !== 'string') throw new Error('不支持表达式动态导入；依赖必须为字面量。');
            var url = resolveCardRuntimeImport(item.n, base), id = enqueue(url);
            changes.push({ start: item.s, end: item.e, text: item.d >= 0 ? JSON.stringify(id) : id });
        }
        changes.sort(function(a, b) { return b.start - a.start; }).forEach(function(change) { text = text.slice(0, change.start) + change.text + text.slice(change.end); });
        return text;
    }
    for (var node of nodes) {
        var type = node.getAttribute('type') || '';
        if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
        var external = node.getAttribute('src'), text = node.textContent, base = document.baseURI;
        if (external) {
            var vendorName = cardRuntimeFixedVendor(new URL(external, document.baseURI).href);
            if (type !== 'module' && vendorName && scripts.some(function(item) { return item.name.startsWith(vendorName + '@'); })) { node.remove(); continue; }
            if (level === 'L0' || level === 'L1') throw new Error('外部脚本需要 L2 依赖下载审核。');
            base = resolveCardRuntimeImport(external, document.baseURI);
            if (type === 'module') {
                node.removeAttribute('src'); node.removeAttribute('integrity'); node.removeAttribute('crossorigin');
                node.textContent = 'import ' + JSON.stringify(enqueue(base)) + ';';
                continue;
            }
            text = await readCardRuntimeDependency(base, options.signal, 3 * 1024 * 1024);
            total += cardRuntimeBytes(text);
            scripts.push({ name: base, url: base, source: text, sha256: await cardRuntimeDigest(text), type: type === 'module' ? 'module' : 'classic', inject: false });
        }
        if (type === 'module' && (level === 'L0' || level === 'L1')) throw new Error('模块需要 L2 依赖下载审核。');
        text = await rewrite(text, base);
        node.removeAttribute('src'); node.removeAttribute('integrity'); node.removeAttribute('crossorigin');
        node.textContent = text.replace(/<\/script/gi, '<\\/script');
    }
    for (var offset = 0; offset < queue.length; offset++) {
        var url = queue[offset], text = await readCardRuntimeDependency(url, options.signal, 3 * 1024 * 1024);
        total += cardRuntimeBytes(text);
        if (total > 8 * 1024 * 1024) throw new Error('依赖闭包不能超过 8 MiB。');
        var sha256 = await cardRuntimeDigest(text), rewritten = await rewrite(text, url);
        var mirror = cardRuntimeEsmMirror(url);
        modules.push({ id: moduleIds.get(url), url: url, source: rewritten, originalSha256: sha256, sha256: await cardRuntimeDigest(rewritten),
            format: 'module', version: mirror ? mirror.version : '' });
    }
    if (total > 8 * 1024 * 1024) throw new Error('依赖闭包不能超过 8 MiB。');
    if (options.signal && options.signal.aborted) throw new Error('依赖审核已取消。');
    var plan = { level: level, entrySource: template.innerHTML, scripts: scripts, modules: modules };
    plan.digest = await cardRuntimeDigest(JSON.stringify(plan));
    return plan;
}
