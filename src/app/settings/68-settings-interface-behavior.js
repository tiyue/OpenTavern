/**
 * “界面与数据”中的聊天显示、提交和串流行为控件。
 */
function getStreamTextAnimationFormConfig() {
    return {
        enabled: !!(dom.streamTextAnimEnabled && dom.streamTextAnimEnabled.checked),
        effect: dom.streamTextAnimEffect && STREAM_TEXT_ANIM_EFFECTS[dom.streamTextAnimEffect.value] ? dom.streamTextAnimEffect.value : 'rise',
        unit: dom.streamTextAnimUnit && dom.streamTextAnimUnit.value === 'char' ? 'char' : 'token',
        duration: Math.round(clampInterfaceSettingNumber(dom.streamTextAnimDuration && dom.streamTextAnimDuration.value, 50, 1000, 180)),
        distance: clampInterfaceSettingNumber(dom.streamTextAnimDistance && dom.streamTextAnimDistance.value, 0.05, 0.8, 0.8),
        scale: clampInterfaceSettingNumber(dom.streamTextAnimScale && dom.streamTextAnimScale.value, 1.02, 1.4, 1.1),
        stagger: Math.round(clampInterfaceSettingNumber(dom.streamTextAnimStagger && dom.streamTextAnimStagger.value, 0, 40, 12))
    };
}

function syncStreamTextAnimationControls() {
    if (dom.streamTextAnimDetails) {
        dom.streamTextAnimDetails.classList.toggle('hidden', !(dom.streamTextAnimEnabled && dom.streamTextAnimEnabled.checked));
    }
    var effect = dom.streamTextAnimEffect ? dom.streamTextAnimEffect.value : 'rise';
    var unit = dom.streamTextAnimUnit ? dom.streamTextAnimUnit.value : 'token';
    if (dom.streamTextAnimDistanceRow) dom.streamTextAnimDistanceRow.classList.toggle('hidden', ['rise', 'slide', 'drop'].indexOf(effect) === -1);
    if (dom.streamTextAnimScaleRow) dom.streamTextAnimScaleRow.classList.toggle('hidden', effect !== 'scale');
    if (dom.streamTextAnimStaggerRow) dom.streamTextAnimStaggerRow.classList.toggle('hidden', unit !== 'char');
}

function hydrateInterfaceBehaviorSettings() {
    ensureInterfaceBehaviorSettings(state.settings);
    hydrateCheckboxControl(dom.showReplyAvatar, state.settings.showReplyAvatar);
    hydrateCheckboxControl(dom.showMsgTokenUsage, state.settings.showMsgTokenUsage);
    hydrateCheckboxControl(dom.submitWithCmdEnter, state.settings.submitWithCmdEnter);
    hydrateCheckboxControl(dom.streamEnabled, state.settings.streamEnabled);
    hydrateCheckboxControl(dom.streamTextAnimEnabled, state.settings.streamTextAnimEnabled);
    hydrateValueControl(dom.streamTextAnimEffect, state.settings.streamTextAnimEffect);
    hydrateValueControl(dom.streamTextAnimUnit, state.settings.streamTextAnimUnit);
    hydrateValueAndLabelControl(dom.streamTextAnimDuration, dom.streamTextAnimDurationVal, state.settings.streamTextAnimDuration);
    hydrateValueAndLabelControl(dom.streamTextAnimDistance, dom.streamTextAnimDistanceVal, state.settings.streamTextAnimDistance);
    hydrateValueAndLabelControl(dom.streamTextAnimScale, dom.streamTextAnimScaleVal, state.settings.streamTextAnimScale);
    hydrateValueAndLabelControl(dom.streamTextAnimStagger, dom.streamTextAnimStaggerVal, state.settings.streamTextAnimStagger);
    hydrateValueControl(dom.streamIdleTimeoutSec, state.settings.streamIdleTimeoutSec);
    if (dom.streamTextAnimDistanceVal) dom.streamTextAnimDistanceVal.textContent = Number(state.settings.streamTextAnimDistance).toFixed(2);
    if (dom.streamTextAnimScaleVal) dom.streamTextAnimScaleVal.textContent = Number(state.settings.streamTextAnimScale).toFixed(2);
    if (dom.streamIdleTimeoutVal) dom.streamIdleTimeoutVal.textContent = formatStreamIdleTimeoutLabel(state.settings.streamIdleTimeoutSec);
    if (dom.streamAnimPreviewBox) dom.streamAnimPreviewBox.textContent = '';
    syncStreamTextAnimationControls();
}

function readInterfaceBehaviorSettingsFromForm(target) {
    var settings = target || (typeof getSettingsFormTarget === 'function' ? getSettingsFormTarget() : state.settings);
    var previousAvatar = !!settings.showReplyAvatar;
    var previousUsage = !!settings.showMsgTokenUsage;
    settings.showReplyAvatar = readCheckboxControlValue(dom.showReplyAvatar, false);
    settings.showMsgTokenUsage = readCheckboxControlValue(dom.showMsgTokenUsage, false);
    settings.submitWithCmdEnter = readCheckboxControlValue(dom.submitWithCmdEnter, true);
    settings.streamEnabled = readCheckboxControlValue(dom.streamEnabled, true);
    var animation = getStreamTextAnimationFormConfig();
    settings.streamTextAnimEnabled = animation.enabled;
    settings.streamTextAnimEffect = animation.effect;
    settings.streamTextAnimUnit = animation.unit;
    settings.streamTextAnimDuration = animation.duration;
    settings.streamTextAnimDistance = animation.distance;
    settings.streamTextAnimScale = animation.scale;
    settings.streamTextAnimStagger = animation.stagger;
    settings.streamIdleTimeoutSec = normalizeStreamIdleTimeoutSec(dom.streamIdleTimeoutSec && dom.streamIdleTimeoutSec.value);
    ensureInterfaceBehaviorSettings(settings);
    if (settings === state.settings) state._settingsMessageDisplayChanged = previousAvatar !== settings.showReplyAvatar || previousUsage !== settings.showMsgTokenUsage;
}

function playStreamTextAnimationPreview() {
    if (!dom.streamAnimPreviewBox || typeof appendStreamAnimText !== 'function') return;
    var config = getStreamTextAnimationFormConfig();
    dom.streamAnimPreviewBox.textContent = '';
    appendStreamAnimText(dom.streamAnimPreviewBox, t('settings_stream_anim_preview_text'), config);
}

function bindInterfaceBehaviorSettingsEvents() {
    if (dom.streamTextAnimEnabled) dom.streamTextAnimEnabled.addEventListener('change', syncStreamTextAnimationControls);
    if (dom.streamTextAnimEffect) dom.streamTextAnimEffect.addEventListener('change', syncStreamTextAnimationControls);
    if (dom.streamTextAnimUnit) dom.streamTextAnimUnit.addEventListener('change', syncStreamTextAnimationControls);
    if (dom.streamAnimPreviewBtn) dom.streamAnimPreviewBtn.addEventListener('click', playStreamTextAnimationPreview);
    if (dom.streamIdleTimeoutSec) {
        dom.streamIdleTimeoutSec.addEventListener('change', function() {
            var normalized = normalizeStreamIdleTimeoutSec(this.value);
            this.value = normalized;
            if (dom.streamIdleTimeoutVal) dom.streamIdleTimeoutVal.textContent = formatStreamIdleTimeoutLabel(normalized);
        });
    }
}
