// ==================== World Book Entry Strategy UI ====================
function updateStrategyButtons(entry) {
    if (!entry) return;
    var c = dom.wiStratConstant;
    var s = dom.wiStratSelective;
    if (!c || !s) return;
    var isConst = !!entry.constant;
    c.setAttribute('data-active', isConst ? 'true' : 'false');
    s.setAttribute('data-active', isConst ? 'false' : 'true');
    if (isConst) {
        c.style.borderColor = 'rgba(245,158,11,0.6)';
        s.style.borderColor = '';
    } else {
        s.style.borderColor = 'rgba(245,158,11,0.6)';
        c.style.borderColor = '';
    }
}
