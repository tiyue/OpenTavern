// ==================== API Connection Test Result UI ====================
function buildApiTestErrorHtml(title, details, suggestions, testedUrls) {
    var html = '<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-300">';
    html += '<div class="font-semibold mb-1">' + title + '</div>';
    if (details) html += '<div class="text-red-200/90 mb-1 whitespace-pre-wrap">' + details + '</div>';
    if (testedUrls && testedUrls.length) {
        html += '<div class="text-[10px] text-red-300/70 mb-1">' + t('api_test_tested_urls_label') + '<br>' + testedUrls.map(function(url) {
            return '- ' + url;
        }).join('<br>') + '</div>';
    }
    if (suggestions && suggestions.length) {
        html += '<div class="mt-1 text-amber-300/90"><div class="font-medium text-[10px] mb-0.5">' + t('api_test_suggest_title') + '</div><ul class="list-disc ml-4 text-[10px] leading-snug">';
        suggestions.forEach(function(suggestion) { html += '<li>' + suggestion + '</li>'; });
        html += '</ul></div>';
    }
    html += '</div>';
    return html;
}

function buildApiTestSuccessHtml(models) {
    var html = '<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-emerald-300">';
    html += '<div class="font-semibold">' + t('api_test_success_title') + '</div>';
    if (models && models.length > 0) {
        var shown = models.slice(0, 12);
        var total = models.length;
        var shownCount = shown.length;
        var listLabel = total > shownCount
            ? t('api_test_models_prefix') + shownCount + t('api_test_models_total') + total + t('api_test_models_mid')
            : t('api_test_models_prefix') + shownCount + t('api_test_models_mid');
        html += '<div class="mt-1 text-emerald-200/90">' + listLabel + '</div>';
        html += '<div class="mt-0.5 text-xs text-emerald-100/80 font-mono break-all">' + shown.join(', ') + '</div>';
        if (total > 12) html += '<div class="text-[10px] text-emerald-300/60 mt-0.5">' + t('api_test_more_omitted') + '</div>';
    } else {
        html += '<div class="text-emerald-200/80 text-xs mt-1">' + t('api_test_models_empty_note') + '</div>';
    }
    html += '</div>';
    return html;
}
