
function bindMyCardReorderEvents(cardEl) {
    if (!cardEl || cardEl._myCardReorderBound) return;
    cardEl._myCardReorderBound = true;
    cardEl.addEventListener('pointerdown', beginMyCardReorderPointer);
    cardEl.addEventListener('touchstart', beginMyCardReorderTouch, { passive: true });
    cardEl.addEventListener('dragstart', preventMyCardNativeDrag);
    cardEl.addEventListener('contextmenu', suppressMyCardReorderContextMenu);
}

function beginMyCardReorderPointer(e) {
    if (e.pointerType === 'touch') return;
    if (e.button !== undefined && e.button !== 0) return;
    beginMyCardReorderSession(e.currentTarget, e.clientX, e.clientY, {
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        sourceEvent: e
    });
}

function beginMyCardReorderTouch(e) {
    if (!e.changedTouches || !e.changedTouches.length) return;
    var touch = e.changedTouches[0];
    beginMyCardReorderSession(e.currentTarget, touch.clientX, touch.clientY, {
        touchId: touch.identifier,
        pointerType: 'touch',
        sourceEvent: e
    });
}

function beginMyCardReorderSession(cardEl, clientX, clientY, input) {
    if (!cardEl || isMyCharacterCardControlClick(input.sourceEvent)) return;

    var key = cardEl.getAttribute('data-card-key');
    var grid = cardEl.parentElement;
    if (!key || !grid) return;

    cancelMyCardReorderSession(myCardReorderState);
    myCardReorderState = {
        cardEl: cardEl,
        grid: grid,
        key: key,
        pointerId: input.pointerId,
        touchId: input.touchId,
        pointerType: input.pointerType,
        startX: clientX,
        startY: clientY,
        lastX: clientX,
        lastY: clientY,
        grabOffsetX: 0,
        grabOffsetY: 0,
        active: false,
        timer: null,
        placeholder: null,
        originalParent: grid,
        originalNextSibling: cardEl.nextSibling,
        originalStyle: cardEl.getAttribute('style'),
        scrollContainer: getMyCardReorderScrollContainer(grid)
    };

    myCardReorderState.timer = setTimeout(function() {
        startMyCardReorderDrag(myCardReorderState);
    }, MY_CARD_REORDER_HOLD_MS);

    addMyCardReorderDocumentListeners(myCardReorderState);
    try {
        if (input.pointerId !== undefined) cardEl.setPointerCapture(input.pointerId);
    } catch (_) {}
}

function addMyCardReorderDocumentListeners(session) {
    if (!session) return;
    if (session.pointerType === 'touch') {
        window.addEventListener('touchmove', moveMyCardReorderTouch, { passive: false, capture: true });
        window.addEventListener('touchend', endMyCardReorderTouch, true);
        window.addEventListener('touchcancel', cancelMyCardReorderTouch, true);
        return;
    }
    window.addEventListener('pointermove', moveMyCardReorderPointer, true);
    window.addEventListener('pointerup', endMyCardReorderPointer, true);
    window.addEventListener('pointercancel', cancelMyCardReorderPointer, true);
}

function removeMyCardReorderDocumentListeners(session) {
    if (!session) return;
    if (session.pointerType === 'touch') {
        window.removeEventListener('touchmove', moveMyCardReorderTouch, true);
        window.removeEventListener('touchend', endMyCardReorderTouch, true);
        window.removeEventListener('touchcancel', cancelMyCardReorderTouch, true);
        return;
    }
    window.removeEventListener('pointermove', moveMyCardReorderPointer, true);
    window.removeEventListener('pointerup', endMyCardReorderPointer, true);
    window.removeEventListener('pointercancel', cancelMyCardReorderPointer, true);
}

function moveMyCardReorderPointer(e) {
    var session = myCardReorderState;
    if (!session || session.pointerId !== e.pointerId) return;
    updateMyCardReorderSession(session, e.clientX, e.clientY, e);
}

function endMyCardReorderPointer(e) {
    var session = myCardReorderState;
    if (!session || session.pointerId !== e.pointerId) return;
    if (session.active) e.preventDefault();
    finishMyCardReorderSession(session, session.active);
}

function cancelMyCardReorderPointer(e) {
    var session = myCardReorderState;
    if (!session || session.pointerId !== e.pointerId) return;
    cancelMyCardReorderSession(session);
}

function moveMyCardReorderTouch(e) {
    var session = myCardReorderState;
    var touch = getMyCardReorderTouch(e, session);
    if (!session || !touch) return;
    updateMyCardReorderSession(session, touch.clientX, touch.clientY, e);
}

function endMyCardReorderTouch(e) {
    var session = myCardReorderState;
    if (!session || !hasMyCardReorderChangedTouch(e, session)) return;
    if (session.active) e.preventDefault();
    finishMyCardReorderSession(session, session.active);
}

function cancelMyCardReorderTouch(e) {
    var session = myCardReorderState;
    if (!session || !hasMyCardReorderChangedTouch(e, session)) return;
    cancelMyCardReorderSession(session);
}

function updateMyCardReorderSession(session, clientX, clientY, event) {
    session.lastX = clientX;
    session.lastY = clientY;

    if (!session.active) {
        var dx = Math.abs(clientX - session.startX);
        var dy = Math.abs(clientY - session.startY);
        if (dx > MY_CARD_REORDER_MOVE_CANCEL_PX || dy > MY_CARD_REORDER_MOVE_CANCEL_PX) {
            cancelMyCardReorderSession(session);
        }
        return;
    }

    if (event && event.cancelable) event.preventDefault();
    moveMyCardReorderFloatingCard(session, clientX, clientY);
    moveMyCardReorderPlaceholder(session, clientX, clientY);
    autoScrollMyCardReorderContainer(session, clientY);
}
