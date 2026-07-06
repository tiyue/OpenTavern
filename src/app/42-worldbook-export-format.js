// ==================== World Book Export Format ====================
function entriesToSTFormat(worldInfo) {
    var out = { entries: {} };
    if (worldInfo && worldInfo.name) out.name = worldInfo.name;
    if (worldInfo && worldInfo.entries) {
        Object.keys(worldInfo.entries).forEach(function(uid) {
            var e = JSON.parse(JSON.stringify(worldInfo.entries[uid]));
            if (!e.extensions) e.extensions = {};
            e.extensions.position = e.position;
            e.extensions.depth = e.depth;
            e.extensions.role = e.role;
            e.extensions.outlet_name = e.outletName;
            e.extensions.group = e.group;
            e.extensions.group_override = e.groupOverride;
            e.extensions.group_weight = e.groupWeight;
            e.extensions.scan_depth = e.scanDepth;
            e.extensions.case_sensitive = e.caseSensitive;
            e.extensions.match_whole_words = e.matchWholeWords;
            e.extensions.use_group_scoring = e.useGroupScoring;
            e.extensions.automation_id = e.automationId;
            e.extensions.sticky = e.sticky;
            e.extensions.cooldown = e.cooldown;
            e.extensions.delay = e.delay;
            e.extensions.exclude_recursion = e.excludeRecursion;
            e.extensions.prevent_recursion = e.preventRecursion;
            e.extensions.delay_until_recursion = e.delayUntilRecursion;
            e.extensions.triggers = e.triggers || [];
            out.entries[String(uid)] = e;
        });
    }
    return out;
}

function getCharacterBookForExport(conv) {
    if (!conv) return null;

    var combinedEntries = {};
    var names = [];

    if (Array.isArray(conv.worldBookIds) && conv.worldBookIds.length > 0) {
        conv.worldBookIds.forEach(function(wbId) {
            var wb = state.worldBooks && state.worldBooks[wbId];
            if (!wb || !wb.entries) return;

            if (wb.name) names.push(wb.name);

            var stFormat = entriesToSTFormat(wb);
            if (stFormat && stFormat.entries) {
                Object.assign(combinedEntries, stFormat.entries);
            }
        });
    }

    if (Object.keys(combinedEntries).length === 0 && conv.worldInfo && conv.worldInfo.entries) {
        var stFormat = entriesToSTFormat(conv.worldInfo);
        if (stFormat && stFormat.entries) {
            Object.assign(combinedEntries, stFormat.entries);
        }
        if (conv.worldInfo.name) names.push(conv.worldInfo.name);
    }

    if (Object.keys(combinedEntries).length === 0) return null;

    var entriesArray = Object.keys(combinedEntries).map(function(uid) {
        return combinedEntries[uid];
    });

    entriesArray.sort(function(a, b) {
        var ia = (a.insertion_order != null ? a.insertion_order : (a.order != null ? a.order : 100));
        var ib = (b.insertion_order != null ? b.insertion_order : (b.order != null ? b.order : 100));
        return ia - ib || (a.id || 0) - (b.id || 0);
    });

    var characterBook = {
        entries: entriesArray
    };

    if (names.length > 0) {
        characterBook.name = names.join(' + ');
    }

    return characterBook;
}
