/**
 * 流式文字动画：只动画本次新增文本；结构化内容保持原有完整渲染路径。
 */
function getStreamTextAnimationConfig() {
    ensureInterfaceBehaviorSettings(state.settings);
    return {
        effect: state.settings.streamTextAnimEffect,
        unit: state.settings.streamTextAnimUnit,
        duration: state.settings.streamTextAnimDuration,
        distance: state.settings.streamTextAnimDistance,
        scale: state.settings.streamTextAnimScale,
        stagger: state.settings.streamTextAnimStagger
    };
}

function prefersReducedMotion() {
    try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
        return false;
    }
}

function isStreamTextAnimationActive() {
    return !!(state.settings && state.settings.streamTextAnimEnabled) &&
        !state.settings.lowPowerMode &&
        !prefersReducedMotion();
}

function applyStreamAnimationVariables(element, config) {
    element.style.setProperty('--stream-anim-duration', config.duration + 'ms');
    element.style.setProperty('--stream-anim-distance', config.distance + 'em');
    element.style.setProperty('--stream-anim-scale', String(config.scale));
}

function scheduleStreamAnimationCleanup(span, config, extraDelay) {
    var settled = false;
    function cleanup() {
        if (settled || !span.parentNode) return;
        settled = true;
        span.parentNode.replaceChild(document.createTextNode(span.textContent || ''), span);
    }
    span.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, Math.min(1600, Math.max(200, config.duration + (extraDelay || 0) + 100)));
}

function appendStreamAnimText(container, delta, config) {
    if (!container || !delta) return;
    config = config || getStreamTextAnimationConfig();
    applyStreamAnimationVariables(container, config);
    var className = 'stream-anim-unit stream-anim-' + (STREAM_TEXT_ANIM_EFFECTS[config.effect] ? config.effect : 'fade');
    if (config.unit === 'char') {
        var chars = Array.from(String(delta));
        var animatedChars = chars.slice(Math.max(0, chars.length - 48));
        var staticHead = chars.slice(0, chars.length - animatedChars.length).join('');
        if (staticHead) container.appendChild(document.createTextNode(staticHead));
        for (var i = 0; i < animatedChars.length; i++) {
            var charSpan = document.createElement('span');
            charSpan.className = className;
            charSpan.textContent = animatedChars[i];
            var delay = i * config.stagger;
            if (delay) charSpan.style.animationDelay = delay + 'ms';
            container.appendChild(charSpan);
            scheduleStreamAnimationCleanup(charSpan, config, delay);
        }
        return;
    }
    var span = document.createElement('span');
    span.className = className;
    span.textContent = String(delta);
    container.appendChild(span);
    scheduleStreamAnimationCleanup(span, config, 0);
}

function streamContentNeedsStaticRender(content) {
    return /<\/?[a-z]|```|~~~|(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|[*_`\[|]/i.test(String(content || ''));
}

function renderStreamingAssistantContent(element, content, renderContext, animateInitial, prepared) {
    if (!element) return;
    prepared = prepared || prepareMessageDisplay({ text: content, context: renderContext, stage: renderContext && renderContext.stage, messageRole: 'assistant', sourcePlacement: 'AI_OUTPUT' });
    var raw = prepared.display.text;
    if (!isStreamTextAnimationActive() || prepared.display.options.length || prepared.display.diagnostics.length || streamContentNeedsStaticRender(raw)) {
        element.innerHTML = renderPreparedAssistantContent(prepared);
        element._streamAnimRaw = raw;
        return;
    }

    var previous = typeof element._streamAnimRaw === 'string' ? element._streamAnimRaw : '';
    if (!previous && animateInitial === false) {
        element.innerHTML = renderPreparedAssistantContent(prepared);
        element._streamAnimRaw = raw;
        return;
    }
    if (previous && !raw.startsWith(previous)) {
        element.innerHTML = renderPreparedAssistantContent(prepared);
        element._streamAnimRaw = raw;
        return;
    }
    var delta = raw.slice(previous.length);
    if (!previous && element.childNodes.length) element.textContent = '';
    if (delta) appendStreamAnimText(element, delta, getStreamTextAnimationConfig());
    element._streamAnimRaw = raw;
}
