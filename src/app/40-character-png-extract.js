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
