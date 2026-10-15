// The broker is independently hosted; HTTP and distinct localhost ports are supported.
async function mountNetworkedCardRuntimeFrame(instance, frame) {
    var address = new URL(instance.grant.network.brokerUrl, document.baseURI);
    if (!['http:', 'https:'].includes(address.protocol) || address.origin === location.origin || address.username || address.password) throw cardRuntimeError('INVALID_BROKER', '联网运行服务必须与应用不同源。');
    var token = instance.token, cancelled = false, channel = new MessageChannel();
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.referrerPolicy = 'no-referrer';
    var dispose;
    var result = new Promise(function(resolve, reject) {
        var timeout = setTimeout(function() { dispose(); reject(cardRuntimeError('BROKER_TIMEOUT', '联网运行服务未响应。')); }, 12000);
        function probe() { if (!cancelled && frame.contentWindow) frame.contentWindow.postMessage({ type: 'card-broker-probe', token: token }, address.origin); }
        function ready(event) {
            if (cancelled || event.source !== frame.contentWindow || event.origin !== address.origin || !event.data || event.data.type !== 'card-broker-ready' || event.data.token !== token) return;
            try {
                assertCardRuntimeInstance(instance, 'network.fetch');
                window.removeEventListener('message', ready); frame.removeEventListener('load', probe); clearTimeout(timeout);
                frame.contentWindow.postMessage({ type: 'card-broker-start', token: token, document: buildCardRuntimeDocument(instance), initial: cardRuntimeInitialData(instance), permissions: instance.grant.permissions, network: instance.grant.network }, address.origin, [channel.port2]);
                resolve(channel.port1);
            } catch (error) { dispose(); reject(error); }
        }
        dispose = function() {
            cancelled = true; clearTimeout(timeout); window.removeEventListener('message', ready); frame.removeEventListener('load', probe);
            channel.port1.close(); channel.port2.close();
            reject(cardRuntimeError('REVOKED', '联网运行实例已停止。'));
        };
        window.addEventListener('message', ready); frame.addEventListener('load', probe);
        var previousCleanup = instance.cleanup;
        instance.cleanup = function() { if (previousCleanup) previousCleanup(); dispose(); };
        frame.src = address.href;
        instance.element.appendChild(frame);
    });
    return result;
}
