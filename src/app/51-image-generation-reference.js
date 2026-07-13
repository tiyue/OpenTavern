// ==================== Qwen Image Character Reference ====================
var IMAGE_GENERATION_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
var IMAGE_GENERATION_REFERENCE_SOURCE_MAX_BYTES = 32 * 1024 * 1024;
var IMAGE_GENERATION_REFERENCE_MAX_DIMENSION = 2048;
var IMAGE_GENERATION_REFERENCE_MIN_DIMENSION = 384;
var IMAGE_GENERATION_REFERENCE_MAX_PIXELS = 24 * 1024 * 1024;

function createImageGenerationAbortError() {
    var error = new Error('图片生成已取消。');
    error.name = 'AbortError';
    return error;
}

function inferImageGenerationReferenceMime(source, blob) {
    var mime = String(blob && blob.type || '').toLowerCase().split(';')[0];
    if (/^image\/(png|jpe?g|webp|gif|bmp)$/.test(mime)) return mime;
    var cleanSource = String(source || '').toLowerCase().split(/[?#]/)[0];
    if (/\.png$/.test(cleanSource)) return 'image/png';
    if (/\.jpe?g$/.test(cleanSource)) return 'image/jpeg';
    if (/\.webp$/.test(cleanSource)) return 'image/webp';
    if (/\.gif$/.test(cleanSource)) return 'image/gif';
    if (/\.bmp$/.test(cleanSource)) return 'image/bmp';
    return '';
}

function getImageGenerationReferenceFetchOptions(source, signal) {
    var credentials = 'omit';
    try {
        var base = window.location && (window.location.href || window.location.origin + '/');
        var parsed = new URL(source, base);
        if (window.location && parsed.origin === window.location.origin) credentials = 'same-origin';
    } catch (_) {}
    return { method: 'GET', credentials: credentials, signal: signal };
}

function getImageGenerationReferenceDeclaredBytes(response) {
    if (!response || !response.headers || typeof response.headers.get !== 'function') return 0;
    var raw = String(response.headers.get('Content-Length') || '').trim();
    if (!/^\d+$/.test(raw)) return 0;
    var bytes = Number(raw);
    if (Number.isFinite(bytes)) return bytes > 0 ? Math.floor(bytes) : 0;
    return /[1-9]/.test(raw) ? Number.MAX_VALUE : 0;
}

function cancelImageGenerationReferenceResponse(response) {
    if (!response || !response.body || typeof response.body.cancel !== 'function') return;
    try {
        var cancelled = response.body.cancel();
        if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(function() {});
    } catch (_) {}
}

function decodeImageGenerationReferenceWithHtmlImage(blob, signal) {
    if (
        typeof Image !== 'function' ||
        typeof URL !== 'function' ||
        typeof URL.createObjectURL !== 'function' ||
        typeof URL.revokeObjectURL !== 'function'
    ) {
        return Promise.reject(new Error('当前浏览器无法处理角色卡图片。'));
    }
    return new Promise(function(resolve, reject) {
        var objectUrl = URL.createObjectURL(blob);
        var image = new Image();
        var settled = false;
        var revoked = false;

        function revokeObjectUrl() {
            if (revoked) return;
            revoked = true;
            URL.revokeObjectURL(objectUrl);
        }

        function cleanupListeners() {
            image.onload = null;
            image.onerror = null;
            if (signal && typeof signal.removeEventListener === 'function') {
                signal.removeEventListener('abort', handleAbort);
            }
        }

        function fail(error) {
            if (settled) return;
            settled = true;
            cleanupListeners();
            revokeObjectUrl();
            reject(error);
        }

        function handleAbort() {
            try { image.src = ''; } catch (_) {}
            fail(createImageGenerationAbortError());
        }

        image.onload = function() {
            if (settled) return;
            settled = true;
            cleanupListeners();
            resolve({
                image: image,
                width: Number(image.naturalWidth || image.width) || 0,
                height: Number(image.naturalHeight || image.height) || 0,
                close: revokeObjectUrl
            });
        };
        image.onerror = function() {
            fail(new Error('无法解码角色卡图片。'));
        };
        if (signal && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', handleAbort);
        }
        if (signal && signal.aborted) {
            handleAbort();
            return;
        }
        image.src = objectUrl;
    });
}

function decodeImageGenerationReferenceBlob(blob, signal) {
    if (signal && signal.aborted) return Promise.reject(createImageGenerationAbortError());
    if (typeof createImageBitmap !== 'function') {
        return decodeImageGenerationReferenceWithHtmlImage(blob, signal);
    }
    return createImageBitmap(blob).then(function(bitmap) {
        if (signal && signal.aborted) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            throw createImageGenerationAbortError();
        }
        return {
            image: bitmap,
            width: Number(bitmap.width) || 0,
            height: Number(bitmap.height) || 0,
            close: function() { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); }
        };
    }).catch(function(error) {
        if (error && error.name === 'AbortError' || signal && signal.aborted) throw createImageGenerationAbortError();
        return decodeImageGenerationReferenceWithHtmlImage(blob, signal);
    });
}

function getImageGenerationReferenceTargetSize(width, height) {
    var maxSide = Math.max(width, height);
    var minSide = Math.min(width, height);
    var scale = maxSide > IMAGE_GENERATION_REFERENCE_MAX_DIMENSION
        ? IMAGE_GENERATION_REFERENCE_MAX_DIMENSION / maxSide
        : 1;
    if (minSide * scale < IMAGE_GENERATION_REFERENCE_MIN_DIMENSION) {
        scale = Math.min(
            3072 / maxSide,
            IMAGE_GENERATION_REFERENCE_MIN_DIMENSION / minSide
        );
    }
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}

function encodeImageGenerationCanvasAsJpeg(canvas, quality) {
    return new Promise(function(resolve, reject) {
        if (!canvas) {
            reject(new Error('当前浏览器无法转换角色卡图片。'));
            return;
        }
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(function(blob) {
                if (blob) resolve(blob);
                else reject(new Error('角色卡图片转换失败。'));
            }, 'image/jpeg', quality);
            return;
        }
        if (typeof canvas.toDataURL !== 'function' || typeof atob !== 'function' || typeof Blob !== 'function') {
            reject(new Error('当前浏览器无法转换角色卡图片。'));
            return;
        }
        try {
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            var encoded = String(dataUrl || '').split(',', 2)[1] || '';
            var binary = atob(encoded);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            resolve(new Blob([bytes], { type: 'image/jpeg' }));
        } catch (error) {
            reject(error);
        }
    });
}

function readImageGenerationReferenceBlobAsDataUrl(blob, signal) {
    return new Promise(function(resolve, reject) {
        if (signal && signal.aborted) {
            reject(createImageGenerationAbortError());
            return;
        }
        var reader = new FileReader();
        var settled = false;

        function cleanup() {
            reader.onload = null;
            reader.onerror = null;
            reader.onabort = null;
            if (signal && typeof signal.removeEventListener === 'function') {
                signal.removeEventListener('abort', handleAbort);
            }
        }

        function finish(callback, value) {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        }

        function handleAbort() {
            try { reader.abort(); } catch (_) {}
            finish(reject, createImageGenerationAbortError());
        }

        reader.onload = function() {
            if (signal && signal.aborted) {
                finish(reject, createImageGenerationAbortError());
                return;
            }
            finish(resolve, String(reader.result || ''));
        };
        reader.onerror = function() { finish(reject, new Error('无法读取处理后的角色卡图片。')); };
        reader.onabort = function() { finish(reject, createImageGenerationAbortError()); };
        if (signal && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', handleAbort);
        }
        try {
            reader.readAsDataURL(blob);
        } catch (error) {
            finish(reject, error);
        }
    });
}

async function prepareImageGenerationReferenceImage(descriptor, signal) {
    descriptor = descriptor || {};
    var source = String(descriptor.source || '').trim();
    if (!source) throw new Error('当前角色卡没有可用图片，无法进行图文生图。');
    if (signal && signal.aborted) throw createImageGenerationAbortError();

    var response;
    try {
        response = await fetch(source, getImageGenerationReferenceFetchOptions(source, signal));
    } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        throw new Error('无法读取角色卡图片，请检查图片地址或跨域配置。');
    }
    if (!response.ok) {
        cancelImageGenerationReferenceResponse(response);
        throw new Error('角色卡图片读取失败（HTTP ' + response.status + '）。');
    }
    var declaredBytes = getImageGenerationReferenceDeclaredBytes(response);
    if (declaredBytes > IMAGE_GENERATION_REFERENCE_SOURCE_MAX_BYTES) {
        cancelImageGenerationReferenceResponse(response);
        throw new Error('原始角色卡图片不能超过 32 MiB。');
    }

    var sourceBlob = await response.blob();
    if (signal && signal.aborted) throw createImageGenerationAbortError();
    var sourceMime = inferImageGenerationReferenceMime(source, sourceBlob);
    if (!sourceMime) throw new Error('角色卡图片格式不受支持，请使用 PNG、JPEG、WebP、GIF 或 BMP。');
    if (!sourceBlob.size || sourceBlob.size > IMAGE_GENERATION_REFERENCE_SOURCE_MAX_BYTES) {
        throw new Error('原始角色卡图片不能超过 32 MiB。');
    }

    var decoded;
    try {
        decoded = await decodeImageGenerationReferenceBlob(sourceBlob, signal);
    } catch (error) {
        if (error && error.name === 'AbortError') throw error;
        throw new Error('无法解码角色卡图片。');
    }
    var canvas = null;
    try {
        if (!decoded.width || !decoded.height) throw new Error('角色卡图片尺寸无效。');
        if (decoded.width > 8192 || decoded.height > 8192) {
            throw new Error('原始角色卡图片宽高不能超过 8192 像素。');
        }
        if (decoded.width * decoded.height > IMAGE_GENERATION_REFERENCE_MAX_PIXELS) {
            throw new Error('原始角色卡图片总像素不能超过 24 MP。');
        }
        var target = getImageGenerationReferenceTargetSize(decoded.width, decoded.height);
        if (target.width > 3072 || target.height > 3072) {
            throw new Error('角色卡图片宽高不能超过 3072 像素。');
        }
        canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        var context = canvas.getContext && canvas.getContext('2d');
        if (!context) throw new Error('当前浏览器无法转换角色卡图片。');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(decoded.image, 0, 0, target.width, target.height);

        var outputBlob = await encodeImageGenerationCanvasAsJpeg(canvas, 0.9);
        if (signal && signal.aborted) throw createImageGenerationAbortError();
        if (outputBlob.size > IMAGE_GENERATION_REFERENCE_MAX_BYTES) {
            outputBlob = await encodeImageGenerationCanvasAsJpeg(canvas, 0.72);
            if (signal && signal.aborted) throw createImageGenerationAbortError();
        }
        if (!outputBlob.size || outputBlob.size > IMAGE_GENERATION_REFERENCE_MAX_BYTES) {
            throw new Error('处理后的角色卡图片仍超过 10 MiB。');
        }
        var dataUrl = await readImageGenerationReferenceBlobAsDataUrl(outputBlob, signal);
        if (!/^data:image\/jpeg;base64,/i.test(dataUrl)) {
            throw new Error('角色卡图片编码失败。');
        }
        return {
            dataUrl: dataUrl,
            mime: 'image/jpeg',
            width: target.width,
            height: target.height,
            bytes: outputBlob.size,
            characterName: String(descriptor.name || '').trim()
        };
    } finally {
        if (decoded && typeof decoded.close === 'function') decoded.close();
        if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
        }
    }
}
