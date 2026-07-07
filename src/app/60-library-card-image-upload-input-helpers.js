// ==================== Library Card Image Upload Input Helpers ====================
function createCardImageUploadInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
}

function removeCardImageUploadInput(input) {
    try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (_) {}
}

function getCardImageUploadFile(input) {
    return input && input.files && input.files[0] ? input.files[0] : null;
}

function readCardImageUploadFile(file, onLoad, onError) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        onLoad(ev.target.result);
    };
    reader.onerror = onError;
    reader.readAsDataURL(file);
}
