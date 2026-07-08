// ==================== My Library Card Ordering ====================
var MY_CARD_REORDER_HOLD_MS = 380;
var MY_CARD_REORDER_MOVE_CANCEL_PX = 18;
var MY_CARD_REORDER_EDGE_SCROLL_PX = 68;
var MY_CARD_REORDER_EDGE_SCROLL_STEP = 18;
var myCardReorderState = null;
var myCardReorderSuppressClickUntil = 0;

function getAllMyCardKeys() {
    return Object.keys(state.characters || {});
}

function normalizeMyCardOrder(order) {
    var known = new Set(getAllMyCardKeys());
    var seen = new Set();
    var result = [];

    (Array.isArray(order) ? order : []).forEach(function(key) {
        key = String(key || '').trim().toLowerCase();
        if (known.has(key) && !seen.has(key)) {
            seen.add(key);
            result.push(key);
        }
    });

    getAllMyCardKeys().forEach(function(key) {
        if (!seen.has(key)) {
            seen.add(key);
            result.push(key);
        }
    });

    return result;
}

function getMyCardOrder() {
    if (!state.settings) state.settings = {};
    state.settings.myCardOrder = normalizeMyCardOrder(state.settings.myCardOrder);
    return state.settings.myCardOrder.slice();
}

function getOrderedMyLibraryCharacters() {
    var characters = state.characters || {};
    return getMyCardOrder().map(function(key) {
        return characters[key];
    }).filter(Boolean);
}

function removeMyCardKeyFromOrder(key) {
    if (!state.settings || !Array.isArray(state.settings.myCardOrder)) return;
    state.settings.myCardOrder = state.settings.myCardOrder.filter(function(item) {
        return item !== key;
    });
}

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

function startMyCardReorderDrag(session) {
    if (!session || myCardReorderState !== session || session.active) return;
    if (!session.cardEl.isConnected || session.cardEl.parentElement !== session.grid) {
        cancelMyCardReorderSession(session);
        return;
    }

    var rect = session.cardEl.getBoundingClientRect();
    session.active = true;
    session.grabOffsetX = Math.max(0, Math.min(rect.width, session.startX - rect.left));
    session.grabOffsetY = Math.max(0, Math.min(rect.height, session.startY - rect.top));
    session.placeholder = createMyCardReorderPlaceholder(rect);
    session.grid.insertBefore(session.placeholder, session.cardEl);
    document.body.appendChild(session.cardEl);
    document.body.classList.add('my-card-reordering');

    session.cardEl.classList.add('my-card-reorder-dragging');
    session.cardEl.style.position = 'fixed';
    session.cardEl.style.left = rect.left + 'px';
    session.cardEl.style.top = rect.top + 'px';
    session.cardEl.style.width = rect.width + 'px';
    session.cardEl.style.height = rect.height + 'px';
    session.cardEl.style.zIndex = '9999';
    session.cardEl.style.pointerEvents = 'none';
    session.cardEl.style.opacity = '0.96';
    session.cardEl.style.transform = 'scale(1.03)';
    session.cardEl.style.transition = 'transform 120ms ease, box-shadow 120ms ease';

    moveMyCardReorderFloatingCard(session, session.lastX, session.lastY);
    myCardReorderSuppressClickUntil = Date.now() + 900;
}

function createMyCardReorderPlaceholder(rect) {
    var placeholder = document.createElement('div');
    placeholder.className = 'my-card-reorder-placeholder rounded-2xl';
    placeholder.style.height = rect.height + 'px';
    placeholder.style.minHeight = rect.height + 'px';
    return placeholder;
}

function moveMyCardReorderFloatingCard(session, clientX, clientY) {
    var left = clientX - session.grabOffsetX;
    var top = clientY - session.grabOffsetY;
    session.cardEl.style.left = left + 'px';
    session.cardEl.style.top = top + 'px';
}

function moveMyCardReorderPlaceholder(session, clientX, clientY) {
    var anchor = getMyCardReorderInsertAnchor(session.grid, session.cardEl, clientX, clientY);
    if (anchor === session.placeholder) return;
    session.grid.insertBefore(session.placeholder, anchor);
}

function getMyCardReorderInsertAnchor(grid, draggedCard, clientX, clientY) {
    var cards = Array.from(grid.querySelectorAll('.my-library-character-card')).filter(function(card) {
        return card !== draggedCard;
    });

    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var rect = card.getBoundingClientRect();
        var rowHit = clientY >= rect.top - 8 && clientY <= rect.bottom + 8;
        if (rowHit) {
            if (clientX < rect.left + rect.width / 2) return card;
            continue;
        }
        if (clientY < rect.top + rect.height / 2) return card;
    }

    return getMyCardActionInsertAnchor(grid);
}

function getMyCardActionInsertAnchor(grid) {
    return grid ? grid.querySelector('.my-card-action-tile') : null;
}

function autoScrollMyCardReorderContainer(session, clientY) {
    var scroller = session.scrollContainer;
    if (!scroller) return;

    var rect = scroller.getBoundingClientRect();
    if (clientY < rect.top + MY_CARD_REORDER_EDGE_SCROLL_PX) {
        scroller.scrollTop -= MY_CARD_REORDER_EDGE_SCROLL_STEP;
    } else if (clientY > rect.bottom - MY_CARD_REORDER_EDGE_SCROLL_PX) {
        scroller.scrollTop += MY_CARD_REORDER_EDGE_SCROLL_STEP;
    }
}

function getMyCardReorderScrollContainer(grid) {
    var node = grid ? grid.parentElement : null;
    while (node && node !== document.body) {
        var style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY)) return node;
        node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

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
