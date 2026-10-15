/** Event binding for navigation, API probing, prompt choice and card selection. */
function moveOnboardingForward(skipStep) {
    if (onboardingState.step >= ONBOARDING_TOTAL_STEPS - 1) {
        finishOnboarding(!!skipStep);
        return;
    }
    if (skipStep) onboardingState.skippedSteps[onboardingState.step] = true;
    else commitOnboardingStep(onboardingState.step);
    onboardingState.step += 1;
    renderOnboardingStep();
}
function setOnboardingPromptChoice(usePrompt) {
    onboardingState.useRoleplayPrompt = !!usePrompt;
    renderOnboardingPromptChoice();
}

function bindOnboardingEvents() {
    var elements = getOnboardingElements();
    if (!elements.dialog || elements.dialog._onboardingEventsBound) return;
    elements.dialog._onboardingEventsBound = true;

    var skipAll = document.getElementById('onboardingSkipAllBtn');
    var connect = document.getElementById('onboardingApiConnectBtn');
    var replay = document.getElementById('onboardingReplayBtn');

    if (skipAll) skipAll.addEventListener('click', function() { finishOnboarding(true); });
    if (elements.back) elements.back.addEventListener('click', function() {
        onboardingState.step = Math.max(0, onboardingState.step - 1);
        renderOnboardingStep();
    });
    if (elements.skipStep) elements.skipStep.addEventListener('click', function() { moveOnboardingForward(true); });
    if (elements.next) elements.next.addEventListener('click', function() { moveOnboardingForward(false); });
    if (connect) connect.addEventListener('click', testOnboardingApiConnection);
    if (elements.modelCatalog) elements.modelCatalog.addEventListener('change', function() {
        if (this.value && elements.modelName) elements.modelName.value = this.value;
    });
    if (elements.promptYes) elements.promptYes.addEventListener('click', function() { setOnboardingPromptChoice(true); });
    if (elements.promptNo) elements.promptNo.addEventListener('click', function() { setOnboardingPromptChoice(false); });
    if (elements.cards) elements.cards.addEventListener('click', function(event) {
        var card = event.target.closest('[data-card-id]');
        if (card) toggleOnboardingFeaturedCard(card.dataset.cardId);
    });
    elements.dialog.addEventListener('cancel', function(event) {
        event.preventDefault();
        finishOnboarding(true);
    });
    elements.dialog.addEventListener('click', function(event) {
        if (event.target === elements.dialog) finishOnboarding(true);
    });

    if (replay) replay.addEventListener('click', function() {
        if (!dom.settingsModal.classList.contains('hidden')) closeSettings();
        setTimeout(showOnboarding, 120);
    });
}
