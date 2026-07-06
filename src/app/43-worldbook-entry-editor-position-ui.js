// ==================== World Book Entry Position UI ====================
function updatePositionConditionalRows(pos) {
    pos = parseInt(pos, 10);
    var depthRow = dom.wiDepthRow;
    var outletRow = dom.wiOutletRow;
    if (!depthRow || !outletRow) return;
    depthRow.classList.toggle('hidden', pos !== WI_POS.AT_DEPTH);
    outletRow.classList.toggle('hidden', pos !== WI_POS.OUTLET);
}
