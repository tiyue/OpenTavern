// ==================== Settings Save Qwen Image Form ====================
function readImageGenerationSettingsFromForm() {
    var settings = ensureImageGenerationSettings();
    if (dom.imageGenerationEnabled) settings.imageGenerationEnabled = readCheckboxControlValue(dom.imageGenerationEnabled, false);
    if (dom.imageGenerationEndpoint) settings.imageGenerationEndpoint = normalizeImageGenerationEndpoint(readControlValue(dom.imageGenerationEndpoint));
    if (dom.imageGenerationToken) saveImageGenerationAccessToken(readControlValue(dom.imageGenerationToken));
    if (dom.imageGenerationSize) settings.imageGenerationSize = normalizeImageGenerationSize(readControlValue(dom.imageGenerationSize));
    if (dom.imageGenerationNegativePrompt) settings.imageGenerationNegativePrompt = readTrimmedControlValue(dom.imageGenerationNegativePrompt).slice(0, 500);
    if (dom.imageGenerationPromptExtend) settings.imageGenerationPromptExtend = readCheckboxControlValue(dom.imageGenerationPromptExtend, true);
    if (dom.imageGenerationIncludeCharacter) settings.imageGenerationIncludeCharacter = readCheckboxControlValue(dom.imageGenerationIncludeCharacter, true);
    if (dom.imageGenerationIncludeContext) settings.imageGenerationIncludeContext = readCheckboxControlValue(dom.imageGenerationIncludeContext, true);
    if (dom.imageGenerationPromptTemplate) {
        settings.imageGenerationPromptTemplate = readTrimmedControlValueOr(
            dom.imageGenerationPromptTemplate,
            getImageGenerationDefaultSettings().imageGenerationPromptTemplate
        ).slice(0, 5000);
    }
    settings.imageGenerationToken = '';
}
