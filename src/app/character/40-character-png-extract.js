/**
 * 新手导读（文件：40-character-png-extract.js）
 *
 * 负责什么：这是“角色卡导入”中的“角色、PNG 图片、提取”部分。
 * 在程序中的位置：它解析 PNG 或 JSON 角色卡，把角色设定和角色世界书转换成内部格式。
 * 从哪里开始看：主要从 `assertSillyTavernPngSignature(bytes)`、`decodeBase64Utf8Json(b64)`、`readPngTextChunk(chunkData)`、`extractCharaFromPng(file)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：外部文件不可信；读取字段时要允许缺失值并避免直接执行其中的内容。
 */
// ==================== SillyTavern PNG Character Extraction ====================
function assertSillyTavernPngSignature(bytes) {
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
        if (bytes[i] !== sig[i]) throw new Error('Not a valid PNG file');
    }
}

function decodeBase64Utf8Json(b64) {
    const binary = atob(b64);
    const decoded = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        decoded[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder('utf-8').decode(decoded);
    return JSON.parse(jsonStr);
}

function readPngTextChunk(chunkData) {
    let keywordEnd = 0;
    while (keywordEnd < chunkData.length && chunkData[keywordEnd] !== 0) keywordEnd++;
    const keyword = new TextDecoder('utf-8').decode(chunkData.slice(0, keywordEnd));
    const valueBytes = chunkData.slice(keywordEnd + 1);
    const value = new TextDecoder('utf-8').decode(valueBytes);
    return { keyword, value };
}

async function extractCharaFromPng(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    assertSillyTavernPngSignature(bytes);

    let offset = 8;
    while (offset < bytes.length) {
        const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        const chunkData = bytes.slice(offset + 8, offset + 8 + length);

        if (type === 'tEXt' || type === 'iTXt') {
            const textChunk = readPngTextChunk(chunkData);
            if (textChunk.keyword === 'chara' || textChunk.keyword === 'ccv3') {
                return decodeBase64Utf8Json(textChunk.value);
            }
        }

        offset += 12 + length;
        if (type === 'IEND') break;
    }

    throw new Error('No SillyTavern character data found in PNG (missing chara/ccv3 chunk)');
}
