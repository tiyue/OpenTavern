// ==================== DOM Cache ====================
var dom = {};

function cacheDom() {
    DOM_CACHE_IDS.forEach(function(id) {
        dom[id] = document.getElementById(id);
    });
}
