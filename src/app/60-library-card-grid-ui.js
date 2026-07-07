function triggerCardImageUpload(char) {
    if (!char || !char.name) return;
    const input = createCardImageUploadInput();
    input.onchange = function() {
        const file = getCardImageUploadFile(input);
        if (!file) {
            removeCardImageUploadInput(input);
            return;
        }
        readCardImageUploadFile(file, function(dataUrl) {
            saveMyCharacterPreviewImage(char, dataUrl);
            removeCardImageUploadInput(input);
        }, function() {
            removeCardImageUploadInput(input);
        });
    };
    input.click();
}
