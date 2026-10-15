
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
