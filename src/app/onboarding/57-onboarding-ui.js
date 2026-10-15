/** Rendering and open/close behavior for the onboarding dialog. */
function getOnboardingElements() {
    return {
        dialog: document.getElementById('onboardingDialog'),
        stepMeta: document.getElementById('onboardingStepMeta'),
        dots: document.getElementById('onboardingProgressDots'),
        back: document.getElementById('onboardingBackBtn'),
        skipStep: document.getElementById('onboardingSkipStepBtn'),
        next: document.getElementById('onboardingNextBtn'),
        endpoint: document.getElementById('onboardingApiEndpoint'),
        apiKey: document.getElementById('onboardingApiKey'),
        saveApiKey: document.getElementById('onboardingSaveApiKey'),
        modelCatalog: document.getElementById('onboardingModelCatalog'),
        modelName: document.getElementById('onboardingModelName'),
        personaName: document.getElementById('onboardingPersonaName'),
        userName: document.getElementById('onboardingUserName'),
        userDescription: document.getElementById('onboardingUserDescription'),
        promptYes: document.getElementById('onboardingPromptYesBtn'),
        promptNo: document.getElementById('onboardingPromptNoBtn'),
        promptFeedback: document.getElementById('onboardingPromptFeedback'),
        cards: document.getElementById('onboardingFeaturedCards')
    };
}
function renderOnboardingModelOptions(models) {
    var elements = getOnboardingElements();
    if (!elements.modelCatalog) return;
    var selected = (elements.modelName && elements.modelName.value) || state.settings.model || '';
    elements.modelCatalog.innerHTML = '';
    var custom = document.createElement('option');
    custom.value = '';
    custom.textContent = t('settings_model_custom_option');
    elements.modelCatalog.appendChild(custom);
    (Array.isArray(models) ? models : []).forEach(function(modelId) {
        var option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        elements.modelCatalog.appendChild(option);
    });
    elements.modelCatalog.value = (Array.isArray(models) && models.indexOf(selected) >= 0) ? selected : '';
}

function hydrateOnboardingForms() {
    var elements = getOnboardingElements();
    if (elements.endpoint) elements.endpoint.value = state.settings.apiEndpoint || '';
    if (elements.apiKey) elements.apiKey.value = state.settings.apiKey || '';
    if (elements.saveApiKey) elements.saveApiKey.checked = !!state.settings.saveApiKey;
    if (elements.modelName) elements.modelName.value = state.settings.model || 'gpt-4o';
    renderOnboardingModelOptions(state.settings.apiModelCatalog || []);

    ensureUserPersonaSettings(state.settings);
    var persona = getUserPersonaById(state.settings.activeUserPersonaId, state.settings) || state.settings.userPersonas[0];
    if (elements.personaName) elements.personaName.value = persona.name || getDefaultUserPersonaName(state.settings);
    if (elements.userName) elements.userName.value = persona.userName || 'User';
    if (elements.userDescription) elements.userDescription.value = persona.description || '';
}

function createOnboardingFeaturedCard(card) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'onboarding-card';
    button.dataset.cardId = card.id;
    button.setAttribute('aria-pressed', onboardingState.selectedCards[card.id] ? 'true' : 'false');
    button.classList.toggle('is-selected', !!onboardingState.selectedCards[card.id]);

    var preview = document.createElement('div');
    preview.className = 'onboarding-card-preview';
    var image = document.createElement('img');
    image.src = resolvePublicCardImageUrl(card);
    image.alt = card.name || '';
    image.loading = 'lazy';
    image.onerror = function() {
        preview.innerHTML = '';
        var fallback = document.createElement('span');
        fallback.className = 'onboarding-card-fallback';
        fallback.textContent = (card.name || '?').charAt(0);
        preview.appendChild(fallback);
    };
    preview.appendChild(image);

    var check = document.createElement('span');
    check.className = 'onboarding-card-check';
    check.textContent = '✓';
    preview.appendChild(check);

    var info = document.createElement('span');
    info.className = 'onboarding-card-info';
    var name = document.createElement('strong');
    name.textContent = card.name || card.id;
    var author = document.createElement('span');
    author.textContent = card.author || '';
    info.appendChild(name);
    info.appendChild(author);

    button.appendChild(preview);
    button.appendChild(info);
    return button;
}

function renderOnboardingFeaturedCards() {
    var host = document.getElementById('onboardingFeaturedCards');
    if (!host || typeof findPublicCardById !== 'function') return;
    host.innerHTML = '';
    ONBOARDING_FEATURED_CARD_IDS.forEach(function(id) {
        var card = findPublicCardById(id);
        if (card) host.appendChild(createOnboardingFeaturedCard(card));
    });
}

function renderOnboardingPromptChoice() {
    var elements = getOnboardingElements();
    var usePrompt = !!onboardingState.useRoleplayPrompt;
    [elements.promptYes, elements.promptNo].forEach(function(button, index) {
        if (!button) return;
        var selected = index === 0 ? usePrompt : !usePrompt;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (elements.promptFeedback) {
        elements.promptFeedback.textContent = t(usePrompt ? 'onboarding_prompt_selected' : 'onboarding_prompt_unchanged');
    }
}

function renderOnboardingStep() {
    var elements = getOnboardingElements();
    if (!elements.dialog) return;
    var step = Math.max(0, Math.min(ONBOARDING_TOTAL_STEPS - 1, onboardingState.step));
    onboardingState.step = step;
    elements.dialog.querySelectorAll('[data-onboarding-step]').forEach(function(panel) {
        panel.hidden = Number(panel.getAttribute('data-onboarding-step')) !== step;
    });
    if (elements.stepMeta) elements.stepMeta.textContent = (step + 1) + ' / ' + ONBOARDING_TOTAL_STEPS;
    if (elements.dots) {
        Array.from(elements.dots.children).forEach(function(dot, index) {
            dot.classList.toggle('is-active', index <= step);
            dot.classList.toggle('is-current', index === step);
        });
    }
    if (elements.back) elements.back.hidden = step === 0;
    if (elements.next) elements.next.textContent = t(step === ONBOARDING_TOTAL_STEPS - 1 ? 'onboarding_finish' : 'onboarding_next');
    renderOnboardingPromptChoice();
    var body = elements.dialog.querySelector('.onboarding-body');
    if (body) body.scrollTop = 0;
}

function showOnboarding() {
    var elements = getOnboardingElements();
    if (!elements.dialog) return false;
    resetOnboardingRuntimeState();
    hydrateOnboardingForms();
    renderOnboardingFeaturedCards();
    renderOnboardingStep();
    if (!elements.dialog.open) {
        if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
        else elements.dialog.setAttribute('open', '');
    }
    document.body.classList.add('onboarding-open');
    return true;
}

function closeOnboarding() {
    var dialog = document.getElementById('onboardingDialog');
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    document.body.classList.remove('onboarding-open');
}

function refreshOnboardingTranslations() {
    if (!isOnboardingOpen()) return;
    renderOnboardingModelOptions(state.settings.apiModelCatalog || []);
    renderOnboardingStep();
}

function scheduleOnboardingModal(delay) {
    if (!shouldShowOnboarding()) return;
    setTimeout(function() {
        if (!isAnyStartupModalOpen()) showOnboarding();
    }, typeof delay === 'number' ? delay : 220);
}
