/** Persist each onboarding choice and import selected public cards on completion. */
function commitOnboardingApiSettings() {
    var elements = getOnboardingElements();
    state.settings.apiEndpoint = elements.endpoint ? elements.endpoint.value.trim() : state.settings.apiEndpoint;
    state.settings.apiKey = elements.apiKey ? elements.apiKey.value.trim() : state.settings.apiKey;
    state.settings.saveApiKey = !!(elements.saveApiKey && elements.saveApiKey.checked);
    state.settings.model = elements.modelName && elements.modelName.value.trim()
        ? elements.modelName.value.trim()
        : (state.settings.model || 'gpt-4o');
    persistState();
}
function commitOnboardingPersona() {
    var elements = getOnboardingElements();
    updateActiveUserPersona({
        name: elements.personaName ? elements.personaName.value.trim() : '',
        userName: elements.userName ? elements.userName.value.trim() : 'User',
        description: elements.userDescription ? elements.userDescription.value : ''
    });
    persistState();
}

function commitOnboardingPrompt() {
    if (!onboardingState.useRoleplayPrompt) return;
    state.settings.systemPrompt = BASE_SYSTEM_PROMPT;
    persistState();
}

function commitOnboardingStep(step) {
    if (step === 0) commitOnboardingApiSettings();
    else if (step === 1) commitOnboardingPersona();
    else if (step === 2) commitOnboardingPrompt();
}

function syncOnboardingApiProbeFields() {
    var elements = getOnboardingElements();
    if (dom.apiEndpoint && elements.endpoint) dom.apiEndpoint.value = elements.endpoint.value.trim();
    if (dom.apiKey && elements.apiKey) dom.apiKey.value = elements.apiKey.value.trim();
    if (dom.saveApiKey && elements.saveApiKey) dom.saveApiKey.checked = elements.saveApiKey.checked;
    if (dom.modelName && elements.modelName) dom.modelName.value = elements.modelName.value.trim() || 'gpt-4o';
}

async function testOnboardingApiConnection() {
    var button = document.getElementById('onboardingApiConnectBtn');
    var status = document.getElementById('onboardingApiStatus');
    if (button) button.disabled = true;
    if (status) {
        status.textContent = t('api_test_testing');
        status.dataset.kind = 'busy';
    }
    syncOnboardingApiProbeFields();
    try {
        var result = await window.testMainApiConnection();
        var models = result && Array.isArray(result.models) ? result.models : [];
        renderOnboardingModelOptions(models);
        if (status) {
            status.textContent = result && result.ok
                ? t('onboarding_api_connected').replace('{n}', String(models.length))
                : t('onboarding_api_failed');
            status.dataset.kind = result && result.ok ? 'success' : 'error';
        }
        return !!(result && result.ok);
    } catch (err) {
        if (status) {
            status.textContent = t('onboarding_api_failed') + ' ' + ((err && err.message) || String(err));
            status.dataset.kind = 'error';
        }
        return false;
    } finally {
        if (button) button.disabled = false;
    }
}

function toggleOnboardingFeaturedCard(cardId) {
    if (ONBOARDING_FEATURED_CARD_IDS.indexOf(cardId) < 0) return;
    onboardingState.selectedCards[cardId] = !onboardingState.selectedCards[cardId];
    var card = document.querySelector('#onboardingFeaturedCards [data-card-id="' + cardId + '"]');
    if (card) {
        card.classList.toggle('is-selected', !!onboardingState.selectedCards[cardId]);
        card.setAttribute('aria-pressed', onboardingState.selectedCards[cardId] ? 'true' : 'false');
    }
}

async function importOnboardingFeaturedCards() {
    var selected = ONBOARDING_FEATURED_CARD_IDS.filter(function(id) {
        return !!onboardingState.selectedCards[id];
    });
    var status = document.getElementById('onboardingCardsStatus');
    if (!selected.length) return { imported: 0, failed: 0 };

    var imported = 0;
    var failed = 0;
    var previousSuppress = window.__suppressPublicCardImportToast;
    window.__suppressPublicCardImportToast = true;
    try {
        for (var i = 0; i < selected.length; i++) {
            var card = findPublicCardById(selected[i]);
            if (!card) {
                failed += 1;
                continue;
            }
            if (status) status.textContent = t('onboarding_cards_importing').replace('{name}', card.name || card.id);
            var importedCharacter = await importPublicCard(card);
            if (importedCharacter) imported += 1;
            else failed += 1;
        }
    } finally {
        if (typeof previousSuppress === 'undefined') delete window.__suppressPublicCardImportToast;
        else window.__suppressPublicCardImportToast = previousSuppress;
    }
    return { imported: imported, failed: failed };
}

async function finishOnboarding(skipCurrentStep) {
    if (onboardingState.finishing) return;
    onboardingState.finishing = true;
    var elements = getOnboardingElements();
    if (elements.next) elements.next.disabled = true;
    if (!skipCurrentStep) commitOnboardingStep(onboardingState.step);

    var result = { imported: 0, failed: 0 };
    if (!skipCurrentStep && onboardingState.step === ONBOARDING_TOTAL_STEPS - 1) {
        result = await importOnboardingFeaturedCards();
    }
    markOnboardingCompleted();
    await persistState(true);
    closeOnboarding();
    onboardingState.finishing = false;
    if (elements.next) elements.next.disabled = false;
    if (result.imported && typeof showGlassAlert === 'function') {
        showGlassAlert(t('onboarding_cards_imported').replace('{n}', String(result.imported)), {
            title: t('onboarding_complete_title')
        });
    }
}
