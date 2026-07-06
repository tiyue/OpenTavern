// ==================== World Info Position Normalization ====================
function normalizeWorldInfoPositionValue(position) {
    if (typeof position === 'string') {
        var p = position.toLowerCase().replace(/_/g, '');
        var posMap = {
            'beforechar': WI_POS.BEFORE_CHAR,
            'afterchar': WI_POS.AFTER_CHAR,
            'beforeex': WI_POS.BEFORE_EX,
            'beforeexample': WI_POS.BEFORE_EX,
            'afterex': WI_POS.AFTER_EX,
            'afterexample': WI_POS.AFTER_EX,
            'topan': WI_POS.TOP_AN,
            'bottoman': WI_POS.BOTTOM_AN,
            'atdepth': WI_POS.AT_DEPTH,
            'outlet': WI_POS.OUTLET
        };
        if (posMap[p] != null) return posMap[p];
    }

    if (position == null || isNaN(parseInt(position, 10))) {
        return WI_POS.AFTER_CHAR;
    }
    return parseInt(position, 10);
}
