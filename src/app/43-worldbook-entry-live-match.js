// ==================== World Book Entry Match Source Bindings ====================
function getWorldBookMatchExtensionKey(prop) {
    return prop.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function bindWorldBookEntryMatchControls() {
    var matchCbs = ['wiMatchCharDesc','wiMatchCharPers','wiMatchScenario','wiMatchPersona','wiMatchCharNote','wiMatchCreatorNotes'];
    var matchProps = ['matchCharacterDescription','matchCharacterPersonality','matchScenario','matchPersonaDescription','matchCharacterDepthPrompt','matchCreatorNotes'];
    matchCbs.forEach(function(id, i) {
        var el = dom[id];
        if (!el) return;
        el.addEventListener('change', function() {
            var entry = getSelectedWorldBookEntry();
            if (!entry) return;
            entry[matchProps[i]] = this.checked;
            if (entry.extensions) entry.extensions[getWorldBookMatchExtensionKey(matchProps[i])] = this.checked;
            wiState.dirty = true;
        });
    });
}
