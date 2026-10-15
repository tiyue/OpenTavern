/**
 * 新手导读（文件：offline/21-private-media-local.js）
 *
 * 负责什么：这是“本地优先”中的“私有图片、本地字节”部分。它把用户自己的、目前只有远程 URL 的图片
 * （聊天图片附件、角色头像/预览）读取成本地 data URL，并用现有可靠保存写回应用状态。
 * 在程序中的位置：运行在存储与状态模块之间，只处理用户数据的字节副本，不碰公共资源缓存。
 * 从哪里开始看：主要从 `PrivateMediaLocal.getStatus()`、`PrivateMediaLocal.prepareAll()`、
 * `PrivateMediaLocal.prepareMessage(convId, messageId)`、`PrivateMediaLocal.subscribe(listener)` 开始阅读。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：只下载无凭据的 http/https 图片地址；绝不使用 CacheStorage、不追加密钥/Cookie；
 * 下载完成后必须重新确认目标仍然存在且版本/URL 未变，再通过可靠保存提交；失败不得覆盖用户新编辑。
 */
// ==================== Private Media Local Bytes ====================
// 单张图片与单次批量（或单条消息）的本地保存字节上限；超限只报告失败，不写入状态。
var PRIVATE_MEDIA_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var PRIVATE_MEDIA_MAX_BATCH_BYTES = 64 * 1024 * 1024;
// 自动下载必须是有界超时，失败即放弃本地准备，不阻塞渲染与模型请求。
var PRIVATE_MEDIA_TIMEOUT_MS = 8000;
var PRIVATE_MEDIA_CONCURRENCY = 2;
var PRIVATE_MEDIA_CHARACTER_FIELDS = ['previewImage', 'avatar'];
var PRIVATE_MEDIA_ALLOWED_MIME = { 'image/png': true, 'image/jpeg': true, 'image/webp': true, 'image/gif': true };

var _privateMediaListeners = [];
var _privateMediaFailures = Object.create(null);
var _privateMediaPreparing = false;
var _privateMediaPreparedBytes = 0;
var _privateMediaConversationChains = Object.create(null);

function getPrivateMediaScope() {
    return state && typeof state === 'object' ? state : {};
}

function isPrivateMediaRemoteUrl(value) {
    var text = String(value == null ? '' : value).trim();
    if (!/^https?:\/\//i.test(text)) return false;
    try {
        var parsed = new URL(text);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password;
    } catch (_) {
        return false;
    }
}

function isPrivateMediaLocalDataUrl(value) {
    return /^data:image\//i.test(String(value == null ? '' : value).trim());
}

function createPrivateMediaAbortError() {
    var error = new Error('图片准备已取消。');
    error.name = 'AbortError';
    return error;
}

function getPrivateMediaErrorMessage(error) {
    if (!error) return '图片准备失败。';
    if (error.name === 'AbortError') return '图片准备已取消。';
    return String(error.message || error);
}

function formatPrivateMediaLimit(maxBytes) {
    var mib = Number(maxBytes) / (1024 * 1024);
    return (mib >= 1 ? Math.round(mib * 10) / 10 : Math.round(mib * 100) / 100) + ' MiB';
}

function normalizePrivateMediaMime(value) {
    var mime = String(value || '').split(';')[0].trim().toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    return mime;
}

// 仅承认真实位图签名；SVG/HTML 等文本不会被当成图片。
function detectPrivateMediaSignatureMime(bytes) {
    if (!bytes || bytes.length < 12) return '';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
        bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) return 'image/png';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    var head6 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
    var head4 = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (head4 === 'RIFF' && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP') return 'image/webp';
    return '';
}

function concatPrivateMediaChunks(chunks, totalBytes) {
    var bytes = new Uint8Array(totalBytes);
    var offset = 0;
    chunks.forEach(function(chunk) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return bytes;
}

function readPrivateMediaDeclaredBytes(response) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') return 0;
    var raw = String(response.headers.get('Content-Length') || '').trim();
    if (!/^\d+$/.test(raw)) return 0;
    var bytes = Number(raw);
    return Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
}

function cancelPrivateMediaResponse(response) {
    if (!response || !response.body || typeof response.body.cancel !== 'function') return;
    try {
        var cancelled = response.body.cancel();
        if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(function() {});
    } catch (_) {}
}

// 边读边计数，声明长度与实际字节都受限；不把整张超大图片读进内存。
async function readPrivateMediaBoundedBytes(response, maxBytes) {
    var body = response && response.body;
    var limitMessage = '图片超过本地保存上限（' + formatPrivateMediaLimit(maxBytes) + '）。';
    if (body && typeof body.getReader === 'function') {
        var reader = body.getReader();
        var chunks = [];
        var total = 0;
        try {
            while (true) {
                var step = await reader.read();
                if (!step || step.done) break;
                var chunk = step.value;
                if (!chunk) continue;
                total += chunk.byteLength;
                if (total > maxBytes) {
                    try { await reader.cancel(); } catch (_) {}
                    throw new Error(limitMessage);
                }
                chunks.push(chunk);
            }
        } finally {
            try { if (typeof reader.releaseLock === 'function') reader.releaseLock(); } catch (_) {}
        }
        return concatPrivateMediaChunks(chunks, total);
    }
    var buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error(limitMessage);
    return new Uint8Array(buffer);
}

// 签名只能说明开头像位图；必须真实解码（createImageBitmap 或 Image 加载）才算未被截断。
async function verifyPrivateMediaImageDecodes(bytes, mime, signal) {
    if (typeof Blob === 'function' && typeof createImageBitmap === 'function') {
        var bitmap = null;
        var width = 0;
        var height = 0;
        try {
            bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
            width = Number(bitmap.width) || 0;
            height = Number(bitmap.height) || 0;
        } catch (error) {
            if (signal && signal.aborted) throw createPrivateMediaAbortError();
            throw new Error('图片内容无法解码，可能已损坏或被截断。');
        } finally {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        }
        if (!width || !height) throw new Error('图片尺寸无效。');
        return true;
    }
    if (typeof Blob === 'function' && typeof Image === 'function' &&
        typeof URL !== 'undefined' && URL && typeof URL.createObjectURL === 'function') {
        return readPrivateMediaImageElementDecodes(bytes, mime, signal);
    }
    // 没有任何解码能力时如实报失败，绝不把未验证的字节当成可用图片。
    throw new Error('当前浏览器无法校验图片内容（缺少解码能力），已放弃本次本地保存。');
}

// 浏览器的后备解码：把字节放进 Blob 对象 URL 交给 Image 真实加载/解码；结束后回收 URL 与监听，并保持有界等待。
function readPrivateMediaImageElementDecodes(bytes, mime, signal) {
    return new Promise(function(resolve, reject) {
        if (signal && signal.aborted) {
            reject(createPrivateMediaAbortError());
            return;
        }
        var objectUrl;
        try {
            objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        } catch (error) {
            reject(new Error('图片内容无法解码，可能已损坏或被截断。'));
            return;
        }
        var image = new Image();
        var settled = false;
        var timer = null;

        function cleanup() {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            image.onload = null;
            image.onerror = null;
            if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', handleAbort);
            if (objectUrl && typeof URL.revokeObjectURL === 'function') {
                try { URL.revokeObjectURL(objectUrl); } catch (_) {}
            }
        }
        function finish(callback, value) {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        }
        function handleAbort() { finish(reject, createPrivateMediaAbortError()); }

        image.onload = function() {
            var width = Number(image.naturalWidth || image.width) || 0;
            var height = Number(image.naturalHeight || image.height) || 0;
            if (!width || !height) {
                finish(reject, new Error('图片尺寸无效。'));
                return;
            }
            finish(resolve, true);
        };
        image.onerror = function() { finish(reject, new Error('图片内容无法解码，可能已损坏或被截断。')); };
        if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort);
        timer = setTimeout(function() {
            finish(reject, new Error('图片解码超过 ' + Math.round(PRIVATE_MEDIA_TIMEOUT_MS / 1000) + ' 秒仍未完成，已取消本次本地准备。'));
        }, PRIVATE_MEDIA_TIMEOUT_MS);
        image.src = objectUrl;
    });
}

function readPrivateMediaBlobAsDataUrl(blob, signal) {
    return new Promise(function(resolve, reject) {
        if (signal && signal.aborted) {
            reject(createPrivateMediaAbortError());
            return;
        }
        if (typeof FileReader !== 'function') {
            reject(new Error('当前浏览器无法把图片转换为本地数据。'));
            return;
        }
        var reader = new FileReader();
        var settled = false;

        function cleanup() {
            reader.onload = null;
            reader.onerror = null;
            reader.onabort = null;
            if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', handleAbort);
        }

        function finish(callback, value) {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        }

        function handleAbort() {
            try { reader.abort(); } catch (_) {}
            finish(reject, createPrivateMediaAbortError());
        }

        reader.onload = function() {
            if (signal && signal.aborted) {
                finish(reject, createPrivateMediaAbortError());
                return;
            }
            finish(resolve, String(reader.result || ''));
        };
        reader.onerror = function() { finish(reject, new Error('无法读取图片字节。')); };
        reader.onabort = function() { finish(reject, createPrivateMediaAbortError()); };
        if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', handleAbort);
        try {
            reader.readAsDataURL(blob);
        } catch (error) {
            finish(reject, error);
        }
    });
}

async function downloadPrivateMediaBytes(url, options) {
    options = options || {};
    if (!isPrivateMediaRemoteUrl(url)) throw new Error('仅支持无凭据的 http/https 图片地址。');
    var requested = Number(options.maxBytes);
    var maxBytes = requested > 0 ? Math.min(requested, PRIVATE_MEDIA_MAX_IMAGE_BYTES) : PRIVATE_MEDIA_MAX_IMAGE_BYTES;
    var external = options.signal || null;
    if (external && external.aborted) throw createPrivateMediaAbortError();

    var controller = new AbortController();
    var timedOut = false;
    var timeout = setTimeout(function() {
        timedOut = true;
        controller.abort();
    }, PRIVATE_MEDIA_TIMEOUT_MS);
    function handleExternalAbort() { controller.abort(); }
    function timeoutError() {
        return new Error('图片下载超过 ' + Math.round(PRIVATE_MEDIA_TIMEOUT_MS / 1000) + ' 秒仍未完成，已取消本次本地准备。');
    }
    if (external && typeof external.addEventListener === 'function') external.addEventListener('abort', handleExternalAbort);

    try {
        var response;
        try {
            var preparedPublic = typeof LocalResourceManager !== 'undefined' && LocalResourceManager &&
                LocalResourceManager.isPublicPrepared(url);
            response = preparedPublic ? await LocalResourceManager.readPublic(url) : await fetch(url, {
                method: 'GET',
                credentials: 'omit',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                cache: 'no-store',
                signal: controller.signal
            });
        } catch (error) {
            if (external && external.aborted) throw createPrivateMediaAbortError();
            if (timedOut || (error && error.name === 'AbortError')) throw timeoutError();
            throw new Error('无法读取该图片地址（可能被跨域限制、网络不可达或地址已失效）。');
        }
        if (!response || !response.ok) {
            cancelPrivateMediaResponse(response);
            throw new Error('图片读取失败（HTTP ' + ((response && response.status) || 0) + '）。');
        }

        var declaredMime = response.headers && typeof response.headers.get === 'function'
            ? normalizePrivateMediaMime(response.headers.get('Content-Type'))
            : '';
        if (declaredMime && !PRIVATE_MEDIA_ALLOWED_MIME[declaredMime]) {
            cancelPrivateMediaResponse(response);
            throw new Error('该图片格式不受支持，仅支持 PNG、JPEG、WebP、GIF 位图。');
        }
        var declaredBytes = readPrivateMediaDeclaredBytes(response);
        if (declaredBytes > maxBytes) {
            cancelPrivateMediaResponse(response);
            throw new Error('图片超过本地保存上限（' + formatPrivateMediaLimit(maxBytes) + '）。');
        }

        var bytes;
        try {
            bytes = await readPrivateMediaBoundedBytes(response, maxBytes);
        } catch (error) {
            if (external && external.aborted) throw createPrivateMediaAbortError();
            if (timedOut || (error && error.name === 'AbortError')) throw timeoutError();
            throw error;
        }
        if (external && external.aborted) throw createPrivateMediaAbortError();
        if (declaredBytes && bytes.length < declaredBytes) throw new Error('图片下载不完整，已放弃本地保存。');

        var signatureMime = detectPrivateMediaSignatureMime(bytes);
        if (!signatureMime) throw new Error('图片内容不是受支持的位图（PNG、JPEG、WebP、GIF）。');
        if (declaredMime && declaredMime !== signatureMime) throw new Error('图片声明的格式与实际内容不一致。');
        await verifyPrivateMediaImageDecodes(bytes, signatureMime, external);
        return { bytes: bytes, mime: signatureMime };
    } finally {
        clearTimeout(timeout);
        if (external && typeof external.removeEventListener === 'function') external.removeEventListener('abort', handleExternalAbort);
    }
}

async function preparePrivateMediaLocalBytes(url, options) {
    options = options || {};
    var downloaded = await downloadPrivateMediaBytes(url, options);
    var blob = new Blob([downloaded.bytes], { type: downloaded.mime });
    var dataUrl = await readPrivateMediaBlobAsDataUrl(blob, options.signal);
    if (!isPrivateMediaLocalDataUrl(dataUrl)) throw new Error('图片无法编码为本地数据。');
    return { dataUrl: dataUrl, mime: downloaded.mime, bytes: downloaded.bytes.length };
}

function getPrivateMediaConversationList() {
    var conversations = getPrivateMediaScope().conversations || {};
    return Object.keys(conversations).map(function(id) { return conversations[id]; }).filter(Boolean);
}

// 目标签名只取决定“这张图属于哪条消息/哪个附件”的语义字段，刻意排除保存后才追加的本地字节（dataUrl），
// 否则同一条消息里的第二个附件会因为第一个附件已写入而误判为已变更。
function buildPrivateMediaAttachmentSignature(message, attachment) {
    var normalizedAttachment = {};
    Object.keys(attachment).forEach(function(key) {
        if (key === 'dataUrl' && isPrivateMediaLocalDataUrl(attachment[key])) return;
        normalizedAttachment[key] = attachment[key];
    });
    return JSON.stringify([
        String(message.id == null ? '' : message.id),
        String(message.role || ''),
        String(message.content || ''),
        String(message.cot || ''),
        String(message.speaker || ''),
        String(message.stage || (message.role === 'assistant' ? 'main' : '')),
        String(message.parentId || ''),
        String(message.selectedResponseVersionId || ''),
        String(message.swipe_id == null ? '' : message.swipe_id),
        normalizedAttachment
    ]);
}

function createPrivateMediaAttachmentTarget(conv, message, attachment, index, url) {
    return {
        kind: 'attachment',
        convId: conv.id,
        messageId: message.id,
        attachmentIndex: index,
        url: url,
        signature: buildPrivateMediaAttachmentSignature(message, attachment)
    };
}

// 下载完成后按 conv/message/附件下标重新解析目标：找不到、类型变了或语义签名不一致都视为目标已变。
function resolvePrivateMediaAttachmentTarget(target) {
    var conv = (getPrivateMediaScope().conversations || {})[target.convId];
    var message = findPrivateMediaMessage(conv, target.messageId);
    if (!message || !Array.isArray(message.attachments)) return null;
    var attachment = message.attachments[target.attachmentIndex];
    if (!attachment || attachment.type !== 'image') return null;
    if (buildPrivateMediaAttachmentSignature(message, attachment) !== target.signature) return null;
    return attachment;
}

function collectPrivateMediaAttachmentSlots() {
    var slots = [];
    getPrivateMediaConversationList().forEach(function(conv) {
        if (!conv || !Array.isArray(conv.messages)) return;
        conv.messages.forEach(function(msg) {
            if (!msg || !Array.isArray(msg.attachments)) return;
            msg.attachments.forEach(function(att, index) {
                if (!att || att.type !== 'image') return;
                if (isPrivateMediaLocalDataUrl(att.dataUrl)) {
                    slots.push({ ready: true, url: '' });
                    return;
                }
                if (!isPrivateMediaRemoteUrl(att.url)) return;
                var url = String(att.url).trim();
                slots.push({
                    ready: false,
                    url: url,
                    target: createPrivateMediaAttachmentTarget(conv, msg, att, index, url)
                });
            });
        });
    });
    return slots;
}

function isPrivateMediaCharacterByteField(key) {
    for (var i = 0; i < PRIVATE_MEDIA_CHARACTER_FIELDS.length; i++) {
        if (key === PRIVATE_MEDIA_CHARACTER_FIELDS[i]) return true;
        if (key === getPrivateMediaCharacterSourceField(PRIVATE_MEDIA_CHARACTER_FIELDS[i])) return true;
    }
    return false;
}

// 角色记录的语义签名：忽略保存后才写入的图片字节字段（及其来源记录），其余字段变化都视为记录已被替换。
function buildPrivateMediaCharacterSignature(character) {
    var normalized = {};
    Object.keys(character).forEach(function(key) {
        if (isPrivateMediaCharacterByteField(key)) return;
        normalized[key] = character[key];
    });
    return JSON.stringify(normalized);
}

function matchesPrivateMediaCharacterSlot(character, field, url, signature) {
    if (!character) return false;
    if (String(character[field] == null ? '' : character[field]).trim() !== url) return false;
    return buildPrivateMediaCharacterSignature(character) === signature;
}

function createPrivateMediaCharacterSlot(holder, field, character) {
    if (!character || typeof character !== 'object') return null;
    var value = character[field];
    if (isPrivateMediaLocalDataUrl(value)) return { ready: true, url: '' };
    if (!isPrivateMediaRemoteUrl(value)) return null;
    var url = String(value).trim();
    return {
        ready: false,
        url: url,
        target: { kind: 'character', holder: holder, field: field, url: url, signature: buildPrivateMediaCharacterSignature(character) }
    };
}

function collectPrivateMediaCharacterSlots() {
    var slots = [];
    var scope = getPrivateMediaScope();
    var characters = scope.characters || {};
    Object.keys(characters).forEach(function(key) {
        PRIVATE_MEDIA_CHARACTER_FIELDS.forEach(function(field) {
            var slot = createPrivateMediaCharacterSlot({ type: 'registry', key: key }, field, characters[key]);
            if (slot) slots.push(slot);
        });
    });
    getPrivateMediaConversationList().forEach(function(conv) {
        PRIVATE_MEDIA_CHARACTER_FIELDS.forEach(function(field) {
            var slot = createPrivateMediaCharacterSlot({ type: 'conversation', convId: conv.id }, field, conv.character);
            if (slot) slots.push(slot);
        });
        var members = conv.group && Array.isArray(conv.group.members) ? conv.group.members : [];
        members.forEach(function(member) {
            var character = member && member.character;
            if (!character || !String(character.name || '').trim()) return;
            var holder = { type: 'member', convId: conv.id, memberKey: String(character.name).trim().toLowerCase() };
            PRIVATE_MEDIA_CHARACTER_FIELDS.forEach(function(field) {
                var slot = createPrivateMediaCharacterSlot(holder, field, character);
                if (slot) slots.push(slot);
            });
        });
    });
    return slots;
}

function scanPrivateMediaSlots() {
    return collectPrivateMediaAttachmentSlots().concat(collectPrivateMediaCharacterSlots());
}

function collectPrivateMediaTargets() {
    return scanPrivateMediaSlots()
        .filter(function(slot) { return !slot.ready && slot.target; })
        .map(function(slot) { return slot.target; });
}

function groupPrivateMediaTargetsByUrl(targets) {
    var groups = Object.create(null);
    targets.forEach(function(target) {
        if (!groups[target.url]) groups[target.url] = [];
        groups[target.url].push(target);
    });
    return groups;
}

function getPrivateMediaCharacterSourceField(field) {
    return field + 'SourceUrl';
}

function readPrivateMediaCharacter(scopee, holder) {
    if (!scopee || !holder) return null;
    if (holder.type === 'registry') {
        return holder.key && scopee.characters ? scopee.characters[holder.key] || null : null;
    }
    var conv = scopee.conversations ? scopee.conversations[holder.convId] : null;
    if (!conv) return null;
    if (holder.type === 'conversation') return conv.character || null;
    if (holder.type === 'member') {
        var members = conv.group && Array.isArray(conv.group.members) ? conv.group.members : [];
        for (var i = 0; i < members.length; i++) {
            var character = members[i] && members[i].character;
            if (character && String(character.name || '').trim().toLowerCase() === holder.memberKey) return character;
        }
    }
    return null;
}

// 只有当前字段仍等于下载时的原始 URL 才写入；原 URL 保留在 *SourceUrl 中作来源记录。
function writePrivateMediaCharacterBytes(scopee, holder, field, url, dataUrl) {
    var character = readPrivateMediaCharacter(scopee, holder);
    if (!character || String(character[field] == null ? '' : character[field]).trim() !== url) return false;
    character[field] = dataUrl;
    character[getPrivateMediaCharacterSourceField(field)] = url;
    return true;
}

// 同一会话的消息保存不能并发：可靠保存用 _messageCommitInProgress 拒绝重入。
function runPrivateMediaConversationTask(convId, task) {
    var key = String(convId);
    var previous = _privateMediaConversationChains[key] || Promise.resolve();
    var next = previous.then(task, task);
    _privateMediaConversationChains[key] = next.then(function() {}, function() {});
    return next;
}

function findPrivateMediaMessage(conv, messageId) {
    if (!conv || !Array.isArray(conv.messages) || !messageId) return null;
    for (var i = 0; i < conv.messages.length; i++) {
        if (conv.messages[i] && conv.messages[i].id === messageId) return conv.messages[i];
    }
    return null;
}

async function savePrivateMediaAttachment(target, dataUrl) {
    var conv = (getPrivateMediaScope().conversations || {})[target.convId];
    if (!conv || typeof persistConversationMessageMutation !== 'function' ||
        typeof isLiveConversation !== 'function' || !isLiveConversation(conv)) return 'missing';
    // 下载期间消息内容/回复版本/附件元数据可能被改动：生成候选前先确认目标语义未变。
    if (!resolvePrivateMediaAttachmentTarget(target)) return 'missing';
    return runPrivateMediaConversationTask(target.convId, function() {
        return persistConversationMessageMutation(conv, function(candidate) {
            var message = findPrivateMediaMessage(candidate, target.messageId);
            if (!message || !Array.isArray(message.attachments)) return 'missing';
            var attachment = message.attachments[target.attachmentIndex];
            if (!attachment || attachment.type !== 'image') return 'missing';
            if (isPrivateMediaLocalDataUrl(attachment.dataUrl)) return 'unchanged';
            if (String(attachment.url == null ? '' : attachment.url).trim() !== target.url) return 'missing';
            attachment.dataUrl = dataUrl;
            return 'changed';
        }, {
            // 保存确认前再次核对；目标在候选生成后又被改写时不写入过期字节。
            validate: function(candidate) {
                var message = findPrivateMediaMessage(candidate, target.messageId);
                if (!message || !Array.isArray(message.attachments)) return false;
                var attachment = message.attachments[target.attachmentIndex];
                if (!attachment || attachment.type !== 'image') return false;
                return buildPrivateMediaAttachmentSignature(message, attachment) === target.signature;
            }
        });
    });
}

async function savePrivateMediaCharacterImage(target, dataUrl) {
    var holder = target.holder;
    var field = target.field;
    var url = target.url;
    var signature = target.signature;
    var validate = function() {
        var character = readPrivateMediaCharacter(getPrivateMediaScope(), holder);
        if (!matchesPrivateMediaCharacterSlot(character, field, url, signature)) {
            throw new Error('图片目标已被修改或删除。');
        }
    };
    // 下载期间目标可能被删除、改成别的图片或整条记录被替换：先确认仍然存在且语义未变，再进入可靠保存。
    if (!matchesPrivateMediaCharacterSlot(readPrivateMediaCharacter(getPrivateMediaScope(), holder), field, url, signature)) return 'missing';
    await persistState(true, {
        throwOnError: true,
        transformSnapshot: function(snapshot) {
            if (!writePrivateMediaCharacterBytes(snapshot, holder, field, url, dataUrl)) {
                throw new Error('图片目标已被修改或删除。');
            }
            return snapshot;
        },
        beforePersist: validate,
        onPersistSuccess: function() {
            validate();
            if (!writePrivateMediaCharacterBytes(getPrivateMediaScope(), holder, field, url, dataUrl)) {
                throw new Error('图片目标已被修改或删除。');
            }
        },
        commitPendingSnapshot: function(snapshot) {
            writePrivateMediaCharacterBytes(snapshot, holder, field, url, dataUrl);
        }
    });
    return 'saved';
}

async function applyPrivateMediaBytes(targets, dataUrl) {
    var saved = 0;
    var skipped = 0;
    var failed = 0;
    var refreshActiveChat = false;
    for (var i = 0; i < targets.length; i++) {
        var target = targets[i];
        try {
            var result = target.kind === 'character'
                ? await savePrivateMediaCharacterImage(target, dataUrl)
                : await savePrivateMediaAttachment(target, dataUrl);
            if (result === 'saved' || result === 'changed') {
                saved += 1;
                if (isPrivateMediaTargetInActiveConversation(target)) refreshActiveChat = true;
            }
            else skipped += 1;
        } catch (error) {
            failed += 1;
            rememberPrivateMediaFailure(target.url, getPrivateMediaErrorMessage(error));
        }
    }
    if (refreshActiveChat) refreshPrivateMediaActiveConversationUi();
    return { saved: saved, skipped: skipped, failed: failed };
}

// 目标是否就显示在当前打开的聊天里；只在确实可见时刷新消息区，不做整页重绘。
function isPrivateMediaTargetInActiveConversation(target) {
    var activeConv = typeof getActiveConv === 'function' ? getActiveConv() : null;
    if (!activeConv || !target) return false;
    if (target.kind === 'attachment') return target.convId === activeConv.id;
    var holder = target.holder;
    if (holder.type === 'registry') {
        return !!(activeConv.character && String(activeConv.character.name || '').trim().toLowerCase() === holder.key);
    }
    return holder.convId === activeConv.id;
}

function refreshPrivateMediaActiveConversationUi() {
    try {
        if (typeof renderMessagesOnly === 'function') renderMessagesOnly();
    } catch (_) {}
}

async function runPrivateMediaPool(items, limit, worker) {
    var index = 0;
    var size = Math.max(1, Math.min(limit, items.length));
    var runners = [];
    for (var i = 0; i < size; i++) {
        runners.push((async function() {
            while (index < items.length) {
                var current = items[index];
                index += 1;
                await worker(current);
            }
        })());
    }
    await Promise.all(runners);
}

async function preparePrivateMediaUrlGroup(url, targets, budget) {
    var reserved = Math.min(budget.remaining, PRIVATE_MEDIA_MAX_IMAGE_BYTES);
    if (reserved <= 0) return { prepared: 0, skipped: targets.length, failed: 0, bytes: 0 };
    budget.remaining -= reserved;
    try {
        var prepared = await preparePrivateMediaLocalBytes(url, { maxBytes: reserved });
        budget.remaining += Math.max(0, reserved - prepared.bytes);
        _privateMediaPreparedBytes += prepared.bytes;
        var applied = await applyPrivateMediaBytes(targets, prepared.dataUrl);
        if (applied.failed === 0) clearPrivateMediaFailure(url);
        return { prepared: applied.saved, skipped: applied.skipped, failed: applied.failed, bytes: prepared.bytes };
    } catch (error) {
        budget.remaining += reserved;
        rememberPrivateMediaFailure(url, getPrivateMediaErrorMessage(error));
        return { prepared: 0, skipped: 0, failed: 1, bytes: 0 };
    }
}

async function prepareAll() {
    var status = getPrivateMediaStatus();
    if (_privateMediaPreparing) return Object.assign({ started: false }, status);
    var groups = groupPrivateMediaTargetsByUrl(collectPrivateMediaTargets());
    var urls = Object.keys(groups);
    if (!urls.length) return Object.assign({ started: true, prepared: 0, skipped: 0, failed: 0, bytes: 0 }, status);

    _privateMediaPreparing = true;
    notifyPrivateMediaListeners();
    var budget = { remaining: PRIVATE_MEDIA_MAX_BATCH_BYTES };
    var summary = { started: true, prepared: 0, skipped: 0, failed: 0, bytes: 0, urls: urls.length };
    try {
        await runPrivateMediaPool(urls, PRIVATE_MEDIA_CONCURRENCY, async function(url) {
            var result = await preparePrivateMediaUrlGroup(url, groups[url], budget);
            summary.prepared += result.prepared;
            summary.skipped += result.skipped;
            summary.failed += result.failed;
            summary.bytes += result.bytes;
            notifyPrivateMediaListeners();
        });
        return summary;
    } finally {
        _privateMediaPreparing = false;
        notifyPrivateMediaListeners();
    }
}

async function prepareMessage(convId, messageId) {
    var conv = (getPrivateMediaScope().conversations || {})[convId];
    if (!conv || !Array.isArray(conv.messages)) return { status: 'missing' };
    var message = findPrivateMediaMessage(conv, messageId);
    if (!message || !Array.isArray(message.attachments)) return { status: 'missing' };
    var targets = [];
    message.attachments.forEach(function(att, index) {
        if (!att || att.type !== 'image') return;
        if (isPrivateMediaLocalDataUrl(att.dataUrl)) return;
        if (!isPrivateMediaRemoteUrl(att.url)) return;
        var url = String(att.url).trim();
        targets.push(createPrivateMediaAttachmentTarget(conv, message, att, index, url));
    });
    var groups = groupPrivateMediaTargetsByUrl(targets);
    var urls = Object.keys(groups);
    if (!urls.length) return { status: 'ready', prepared: 0, skipped: 0, failed: 0 };

    var budget = { remaining: PRIVATE_MEDIA_MAX_BATCH_BYTES };
    var summary = { status: 'prepared', prepared: 0, skipped: 0, failed: 0 };
    for (var i = 0; i < urls.length; i++) {
        var result = await preparePrivateMediaUrlGroup(urls[i], groups[urls[i]], budget);
        summary.prepared += result.prepared;
        summary.skipped += result.skipped;
        summary.failed += result.failed;
        notifyPrivateMediaListeners();
    }
    if (!summary.prepared) summary.status = summary.failed ? 'failed' : 'missing';
    return summary;
}

function rememberPrivateMediaFailure(url, message) {
    _privateMediaFailures[url] = String(message || '图片准备失败。');
}

function clearPrivateMediaFailure(url) {
    if (!Object.prototype.hasOwnProperty.call(_privateMediaFailures, url)) return;
    delete _privateMediaFailures[url];
}

function getPrivateMediaStatus() {
    var slots = scanPrivateMediaSlots();
    var ready = 0;
    var pending = 0;
    var pendingUrls = Object.create(null);
    slots.forEach(function(slot) {
        if (slot.ready) {
            ready += 1;
            return;
        }
        pending += 1;
        pendingUrls[slot.url] = true;
    });
    var failureCount = 0;
    var failureMessage = '';
    Object.keys(pendingUrls).forEach(function(url) {
        if (!Object.prototype.hasOwnProperty.call(_privateMediaFailures, url)) return;
        failureCount += 1;
        if (!failureMessage) failureMessage = _privateMediaFailures[url];
    });
    var text = '已准备 ' + ready + ' 张本地图片；待准备 ' + pending + ' 张。';
    if (failureCount) text += '其中 ' + failureCount + ' 张读取失败：' + failureMessage;
    return {
        preparing: _privateMediaPreparing,
        total: ready + pending,
        ready: ready,
        pending: pending,
        pendingUrls: Object.keys(pendingUrls).length,
        failed: failureCount,
        failureMessage: failureMessage,
        preparedBytes: _privateMediaPreparedBytes,
        text: text
    };
}

function notifyPrivateMediaListeners() {
    if (!_privateMediaListeners.length) return;
    var status = getPrivateMediaStatus();
    _privateMediaListeners.slice().forEach(function(listener) {
        try { listener(status); } catch (_) {}
    });
}

function subscribePrivateMedia(listener) {
    if (typeof listener !== 'function') return function() {};
    _privateMediaListeners.push(listener);
    return function unsubscribePrivateMedia() {
        var index = _privateMediaListeners.indexOf(listener);
        if (index >= 0) _privateMediaListeners.splice(index, 1);
    };
}

// 只暴露没有外部依赖的入口：状态、手动批量准备、单条消息准备与订阅。
var PrivateMediaLocal = {
    getStatus: getPrivateMediaStatus,
    prepareAll: prepareAll,
    prepareMessage: prepareMessage,
    subscribe: subscribePrivateMedia,
    isRemoteImageUrl: isPrivateMediaRemoteUrl,
    isLocalImageDataUrl: isPrivateMediaLocalDataUrl,
    getCharacterSourceField: getPrivateMediaCharacterSourceField
};
