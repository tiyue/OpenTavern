
function finishMyCardReorderSession(session, commit) {
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    removeMyCardReorderDocumentListeners(session);

    if (session.active) {
        if (commit) {
            session.grid.insertBefore(session.cardEl, session.placeholder);
        } else {
            restoreMyCardToOriginalPosition(session);
        }
    }

    cleanupMyCardReorderSession(session);
    if (commit && session.active) {
        persistMyCardOrderFromGrid(session.grid);
        myCardReorderSuppressClickUntil = Date.now() + 700;
    }
    if (myCardReorderState === session) myCardReorderState = null;
}

function cancelMyCardReorderSession(session) {
    finishMyCardReorderSession(session, false);
}

function restoreMyCardToOriginalPosition(session) {
    if (!session || !session.originalParent) return;
    var anchor = session.originalNextSibling && session.originalNextSibling.parentElement === session.originalParent
        ? session.originalNextSibling
        : getMyCardActionInsertAnchor(session.originalParent);
    session.originalParent.insertBefore(session.cardEl, anchor);
}

function cleanupMyCardReorderSession(session) {
    if (!session) return;
    if (session.placeholder && session.placeholder.parentElement) {
        session.placeholder.parentElement.removeChild(session.placeholder);
    }
    session.cardEl.classList.remove('my-card-reorder-dragging');
    if (session.originalStyle === null) {
        session.cardEl.removeAttribute('style');
    } else {
        session.cardEl.setAttribute('style', session.originalStyle);
    }
    document.body.classList.remove('my-card-reordering');
    try {
        if (session.pointerId !== undefined) session.cardEl.releasePointerCapture(session.pointerId);
    } catch (_) {}
}

function persistMyCardOrderFromGrid(grid) {
    if (!grid || !state.settings) return;
    var visibleKeys = Array.from(grid.querySelectorAll('.my-library-character-card')).map(function(card) {
        return card.getAttribute('data-card-key');
    }).filter(Boolean);

    var visibleSet = new Set(visibleKeys);
    var visibleQueue = visibleKeys.slice();
    var nextOrder = getMyCardOrder().map(function(key) {
        return visibleSet.has(key) ? visibleQueue.shift() : key;
    }).filter(Boolean);

    visibleQueue.forEach(function(key) {
        if (nextOrder.indexOf(key) === -1) nextOrder.push(key);
    });

    state.settings.myCardOrder = normalizeMyCardOrder(nextOrder);
    persistState(true);
}

function shouldSuppressMyCardReorderClick() {
    return Date.now() < myCardReorderSuppressClickUntil;
}

function getMyCardReorderTouch(e, session) {
    if (!session || session.touchId === undefined) return null;
    for (var i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === session.touchId) return e.touches[i];
    }
    return null;
}

function hasMyCardReorderChangedTouch(e, session) {
    if (!session || session.touchId === undefined || !e.changedTouches) return false;
    for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === session.touchId) return true;
    }
    return false;
}

function preventMyCardNativeDrag(e) {
    e.preventDefault();
}

function suppressMyCardReorderContextMenu(e) {
    if (myCardReorderState) {
        e.preventDefault();
    }
}
