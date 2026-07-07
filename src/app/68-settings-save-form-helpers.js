// ==================== Settings Save Form Helpers ====================
function readTrimmedControlValue(control) {
    return control ? String(control.value || '').trim() : '';
}

function readControlValue(control) {
    return control ? String(control.value || '') : '';
}

function readControlValueOr(control, fallback) {
    return readControlValue(control) || fallback;
}

function readTrimmedControlValueOr(control, fallback) {
    return readTrimmedControlValue(control) || fallback;
}

function readCheckboxControlValue(control, fallback) {
    return control ? !!control.checked : !!fallback;
}

function readIntegerControlValue(control, fallback) {
    return parseInt(control.value) || fallback;
}

function readFloatControlValue(control, fallback) {
    return parseFloat(control.value) || fallback;
}

function readFiniteFloatControlValue(control, fallback) {
    var value = parseFloat(control.value);
    return Number.isFinite(value) ? value : fallback;
}
