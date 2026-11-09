// Group strategy dialog: strategy, member weights, manual next speaker and bounded auto rounds.
function renderGroupAutoRoundStatus(message) {
    var status = document.getElementById('groupStrategyStatus');
    if (status && message) status.textContent = message;
    var dialog = document.getElementById('groupStrategyDialog');
    if (dialog) renderGroupStrategyNextSpeaker();
}

function renderGroupStrategyNextSpeaker() {
    var host = document.getElementById('groupStrategyNextSpeaker');
    var conv = getActiveConv();
    if (!host || !isGroupChat(conv)) return;
    var speaker = conv._nextGroupSpeaker || getCurrentSpeakerCharacter(conv);
    host.textContent = speaker ? t('group_strategy_next_speaker') + ': ' + speaker.name : t('group_strategy_no_speaker');
}

function renderGroupStrategyWeights(conv, strategy) {
    var host = document.getElementById('groupStrategyWeights');
    if (!host) return;
    host.innerHTML = getGroupMembers(conv).map(function(member) {
        var name = member.character.name;
        var weight = Object.prototype.hasOwnProperty.call(strategy.weights, name) ? strategy.weights[name] : 1;
        return '<div class="feature-row"><span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(member.muted ? t('group_strategy_muted') : t('group_strategy_active_member')) + '</small></span>' +
            '<label class="feature-field group-weight-field"><span>' + escapeHtml(t('group_strategy_weight')) + '</span><input type="number" min="0" step="0.1" data-group-weight="' + escapeHtml(name) + '" value="' + escapeHtml(String(weight)) + '"' + (member.muted ? ' disabled' : '') + '></label></div>';
    }).join('');
}

function readGroupStrategyFromDialog(dialog, conv) {
    var weights = {};
    dialog.querySelectorAll('[data-group-weight]').forEach(function(input) {
        var value = Number(input.value);
        if (!Number.isFinite(value) || value < 0) throw new Error(t('group_strategy_weight_invalid'));
        weights[input.dataset.groupWeight] = value;
    });
    return {
        mode: dialog.querySelector('#groupStrategyMode').value,
        weights: weights,
        manualSpeakerName: dialog.querySelector('#groupStrategyManualSpeaker').value,
        autoRoundCount: Number(dialog.querySelector('#groupStrategyRounds').value),
        autoRoundIntervalSec: Number(dialog.querySelector('#groupStrategyInterval').value)
    };
}

async function saveGroupStrategyFromDialog(dialog, conv) {
    var strategy = readGroupStrategyFromDialog(dialog, conv);
    await saveGroupSpeakerStrategy(conv, strategy);
    dialog.querySelector('#groupStrategyStatus').textContent = t('group_strategy_saved');
    renderGroupStrategyNextSpeaker();
    return strategy;
}

function openGroupStrategyDialog() {
    var conv = getActiveConv();
    if (!isGroupChat(conv)) { alert(t('group_strategy_not_group')); return; }
    var strategy = getGroupSpeakerStrategy(conv);
    var manualChoices = [['', t('group_strategy_manual_none')]].concat(getGroupMembers(conv).filter(function(member) { return !member.muted; }).map(function(member) {
        return [member.character.name, member.character.name];
    }));
    var dialog = openFeatureDialog('groupStrategyDialog', t('group_strategy_title'),
        '<p class="feature-hint">' + escapeHtml(t('group_strategy_hint')) + '</p>' +
        featureSelect(t('group_strategy_mode'), 'groupStrategyMode', strategy.mode, [
            ['round-robin', t('group_strategy_round_robin')],
            ['manual', t('group_strategy_manual')],
            ['natural', t('group_strategy_natural')],
            ['probability', t('group_strategy_probability')]
        ]) +
        featureSelect(t('group_strategy_manual_speaker'), 'groupStrategyManualSpeaker', strategy.manualSpeakerName, manualChoices) +
        '<div id="groupStrategyWeights"></div>' +
        '<div class="feature-grid">' +
        featureField(t('group_strategy_rounds'), 'groupStrategyRounds', strategy.autoRoundCount, 'number', 'min="1" max="10" step="1"') +
        featureField(t('group_strategy_interval'), 'groupStrategyInterval', strategy.autoRoundIntervalSec, 'number', 'min="1" max="30" step="1"') +
        '</div>' +
        '<p class="feature-hint">' + escapeHtml(t('group_strategy_rounds_hint')) + '</p>' +
        '<p id="groupStrategyNextSpeaker" class="feature-hint"></p>' +
        '<p id="groupStrategyStatus" class="feature-hint" role="status" aria-live="polite"></p>' +
        '<div class="feature-toolbar"><button type="button" data-group-strategy-save>' + escapeHtml(t('group_strategy_save')) + '</button>' +
        '<button type="button" data-group-strategy-start>' + escapeHtml(t('group_strategy_auto_start')) + '</button>' +
        '<button type="button" data-group-strategy-stop>' + escapeHtml(t('group_strategy_auto_stop')) + '</button></div>', null);
    renderGroupStrategyWeights(conv, strategy);
    renderGroupStrategyNextSpeaker();
    if (typeof isGroupAutoRoundsActive === 'function' && isGroupAutoRoundsActive()) dialog.querySelector('#groupStrategyStatus').textContent = t('group_strategy_auto_running');
    dialog.addEventListener('click', async function(event) {
        var button = event.target.closest('button');
        if (!button) return;
        try {
            if (button.hasAttribute('data-group-strategy-save')) await saveGroupStrategyFromDialog(dialog, conv);
            if (button.hasAttribute('data-group-strategy-start')) {
                var saved = await saveGroupStrategyFromDialog(dialog, conv);
                startGroupAutoRounds(conv, saved.autoRoundCount, saved.autoRoundIntervalSec);
                dialog.querySelector('#groupStrategyStatus').textContent = t('group_strategy_auto_running');
            }
            if (button.hasAttribute('data-group-strategy-stop')) {
                // Cancel future auto rounds only; the in-flight reply still settles normally.
                cancelGroupAutoRounds();
                dialog.querySelector('#groupStrategyStatus').textContent = t('group_strategy_stopped');
            }
        } catch (error) {
            dialog.querySelector('.feature-error').textContent = error.message;
        }
    });
}

function addGroupStrategyChatEntry(parent) {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'groupStrategyEntry';
    button.className = 'feature-entry feature-entry-compact';
    button.textContent = t('group_strategy_entry');
    button.onclick = openGroupStrategyDialog;
    parent.appendChild(button);
}
