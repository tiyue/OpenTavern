function characterPngCrc(bytes) {
    var crc = 0xffffffff;
    for (var index = 0; index < bytes.length; index++) {
        crc ^= bytes[index];
        for (var bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

async function embedCharacterCardPng(png, card) {
    var bytes = new Uint8Array(await png.arrayBuffer());
    assertSillyTavernPngSignature(bytes);
    var utf8 = new TextEncoder().encode(JSON.stringify(card)), binary = '';
    for (var i = 0; i < utf8.length; i += 32768) binary += String.fromCharCode.apply(null, utf8.subarray(i, i + 32768));
    var data = new TextEncoder().encode('chara\0' + btoa(binary));
    var chunk = new Uint8Array(data.length + 12), view = new DataView(chunk.buffer);
    view.setUint32(0, data.length); chunk.set([116, 69, 88, 116], 4); chunk.set(data, 8);
    view.setUint32(chunk.length - 4, characterPngCrc(chunk.subarray(4, chunk.length - 4)));
    var parts = [bytes.subarray(0, 8)], offset = 8;
    while (offset + 12 <= bytes.length) {
        var length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
        if (offset + length + 12 > bytes.length) throw new Error('PNG 数据不完整');
        var type = String.fromCharCode.apply(null, bytes.subarray(offset + 4, offset + 8));
        if (type === 'IEND') { parts.push(chunk, bytes.subarray(offset, offset + length + 12)); return new Blob(parts, { type: 'image/png' }); }
        var keyword = type === 'tEXt' || type === 'iTXt' ? readPngTextChunk(bytes.subarray(offset + 8, offset + 8 + length)).keyword : '';
        if (keyword !== 'chara' && keyword !== 'ccv3') parts.push(bytes.subarray(offset, offset + length + 12));
        offset += length + 12;
    }
    throw new Error('PNG 缺少结束块');
}

async function exportCharacterPng() {
    var conv = getActiveConv(), character = conv && conv.character;
    if (!character) throw new Error('当前会话没有角色');
    var card = buildCharacterCardExportPayload(character, getCharacterBookForExport(conv));
    var canvas = document.createElement('canvas'), source = getMessageAvatarSource(character);
    canvas.width = 128; canvas.height = 128;
    if (source) {
        var image = new Image(); image.crossOrigin = 'anonymous';
        await new Promise(function(resolve, reject) { image.onload = resolve; image.onerror = function() { reject(new Error('头像无法读取，请导出 JSON 或使用本地头像')); }; image.src = source; });
        var scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
        var context = canvas.getContext('2d'); context.fillStyle = '#26231f'; context.font = '64px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(character.name.charAt(0), 64, 64);
    }
    var png = await new Promise(function(resolve, reject) { canvas.toBlob(function(blob) { if (blob) resolve(blob); else reject(new Error('无法编码 PNG')); }, 'image/png'); });
    var output = await embedCharacterCardPng(png, card), url = URL.createObjectURL(output), link = document.createElement('a');
    link.href = url; link.download = (character.name || 'character').replace(/[^a-zA-Z0-9一-鿿]/g, '_') + '_card.png'; link.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function openCharacterExportFormats() {
    var dialog = openFeatureDialog('characterExportDialog', '导出角色卡', featureSelect('格式', 'characterExportFormat', 'json', [['json', 'JSON'], ['png', 'PNG 角色卡']]), async function() {
        if (dialog.querySelector('#characterExportFormat').value === 'png') await exportCharacterPng(); else exportCharacter();
    }, { saveLabel: '导出' });
}
