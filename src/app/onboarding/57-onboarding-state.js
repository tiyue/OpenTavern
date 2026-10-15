/** Four-step first-run onboarding state. Completion is intentionally separate from app data. */
var ONBOARDING_COMPLETED_KEY = 'opentavern_onboarding_completed_v1';
var ONBOARDING_TOTAL_STEPS = 4;
var ONBOARDING_FEATURED_CARD_IDS = ['misono_mika', 'sakuraba_ema'];
var onboardingState = createOnboardingRuntimeState();

function createOnboardingRuntimeState() {
    return {
        step: 0,
        useRoleplayPrompt: true,
        selectedCards: {},
        skippedSteps: {},
        finishing: false
    };
}
function resetOnboardingRuntimeState() {
    onboardingState = createOnboardingRuntimeState();
    return onboardingState;
}

function shouldShowOnboarding() {
    try {
        return localStorage.getItem(ONBOARDING_COMPLETED_KEY) !== '1';
    } catch (_) {
        return true;
    }
}

function markOnboardingCompleted() {
    try { localStorage.setItem(ONBOARDING_COMPLETED_KEY, '1'); } catch (_) {}
}

function isOnboardingOpen() {
    var dialog = document.getElementById('onboardingDialog');
    return !!(dialog && (dialog.open || dialog.hasAttribute('open')));
}
