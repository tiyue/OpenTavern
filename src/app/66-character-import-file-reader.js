// ==================== Character Import File Reader ====================
async function readCharacterImportFile(file) {
    var lowerName = (file.name || '').toLowerCase();
    if (lowerName.endsWith('.png')) {
        return {
            json: await extractCharaFromPng(file),
            attachedPreview: await readFileAsDataUrl(file)
        };
    }
    return {
        json: JSON.parse(await readFileAsText(file)),
        attachedPreview: null
    };
}

function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}
