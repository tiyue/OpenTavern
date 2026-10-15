import { assert, messageIdentitySource, assertRejects } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';


async function assertPackyImageGenerationContract() {
  const failures = [];
  let imageModuleFiles = [];

  async function capture(label, callback) {
    try {
      await callback();
    } catch (error) {
      failures.push(`${label}: ${error && error.message ? error.message : String(error)}`);
    }
  }

  await capture('manifest', async () => {
    const manifest = JSON.parse(await readFile(new URL('../../../src/app/manifest.json', import.meta.url), 'utf8'));
    assert(Array.isArray(manifest), 'Frontend manifest must be an array.');
    const comfyFiles = manifest.filter((file) => /^51-comfyui(?:-|\.)/i.test(String(file).split("/").pop()));
    assert(comfyFiles.length === 0, `Frontend manifest still contains retired ComfyUI modules: ${comfyFiles.join(', ')}`);
    imageModuleFiles = manifest.filter((file) => /^51-image-generation(?:-|\.)[^/]*\.js$/i.test(String(file).split("/").pop()));
    assert(imageModuleFiles.length > 0, 'Frontend manifest does not contain any 51-image-generation modules.');
    for (const modulePart of ['prompt', 'reference', 'summary', 'client', 'message', 'runtime']) {
      assert(imageModuleFiles.some((file) => file.includes(modulePart)), `Frontend manifest is missing a 51-image-generation ${modulePart} module.`);
    }
  });

  await capture('dialog markup', async () => {
    const indexSource = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
    const composerEvents = await readFile(new URL('../../../src/app/events/71-event-chat-composer-bindings.js', import.meta.url), 'utf8');
    const imageUi = await readFile(new URL('../../../src/app/image/51-image-generation-ui.js', import.meta.url), 'utf8');
    assert(/id="imageGenerationPanel"[^>]+role="dialog"[^>]+aria-modal="true"/.test(indexSource), 'Image generation panel must expose modal dialog semantics.');
    assert(/aria-labelledby="imageGenerationTitle"/.test(indexSource), 'Image generation panel must have an accessible title reference.');
    assert(composerEvents.includes('handleImageGenerationPanelKeydown'), 'Image generation panel must bind keyboard handling.');
    assert(imageUi.includes("event.key === 'Escape'") && imageUi.includes("event.key !== 'Tab'"), 'Image generation panel must handle Escape and focus trapping.');
    assert(imageUi.includes('imageGenerationPreviousFocus'), 'Image generation panel must restore focus after closing.');
  });

  await capture('deployment proxy', async () => {
    const nginxSource = await readFile(new URL('../../../server/nginx-opentavern-sync-location.conf', import.meta.url), 'utf8');
    assert(/location\s*=\s*\/api\/sync\s*\{/.test(nginxSource), 'Nginx deployment must proxy the frontend default /api/sync endpoint.');
    assert((nginxSource.match(/proxy_read_timeout\s+600s;/g) || []).length === 2, 'Both exact image-generation routes must allow the Packy synchronous request timeout window.');
    assert((nginxSource.match(/client_max_body_size\s+16m;/g) || []).length === 2, 'Both exact image-generation routes must accept the Base64 character reference image.');
  });

  await capture('systemd compatibility', async () => {
    const baseline = await readFile(new URL('../../../server/opentavern-sync.service', import.meta.url), 'utf8');
    const modern = await readFile(new URL('../../../server/opentavern-sync-modern-hardening.conf', import.meta.url), 'utf8');
    const tmpfiles = await readFile(new URL('../../../server/opentavern-sync.tmpfiles.conf', import.meta.url), 'utf8');
    for (const unsupported of [
      'ProtectSystem=strict', 'ReadWritePaths=', 'StateDirectory=', 'ProtectClock=',
      'ProtectControlGroups=', 'ProtectHostname=', 'ProtectKernelLogs=',
      'ProtectKernelModules=', 'ProtectKernelTunables=', 'RestrictNamespaces=',
      'RestrictRealtime=', 'RestrictSUIDSGID=', 'LockPersonality=',
      'MemoryDenyWriteExecute=', 'AmbientCapabilities=',
    ]) {
      assert(!baseline.includes(unsupported), `The systemd 219 baseline must not contain ${unsupported}`);
    }
    assert(baseline.includes('ProtectSystem=full') && baseline.includes('ReadOnlyDirectories=/'), 'The systemd 219 baseline must keep the root filesystem read-only.');
    assert(baseline.includes('ReadWriteDirectories=/var/lib/opentavern-sync'), 'The systemd 219 baseline must only reopen the data directory for writes.');
    assert(baseline.includes('PrivateTmp=true') && baseline.includes('PermissionsStartOnly=true'), 'The systemd 219 baseline must isolate temporary files and prepare directories before sandboxing.');
    assert(modern.includes('ProtectSystem=strict') && modern.includes('MemoryDenyWriteExecute=true'), 'The optional modern systemd drop-in must preserve newer hardening directives.');
    assert(tmpfiles.includes('/var/lib/opentavern-sync 0750') && tmpfiles.includes('sync.sqlite3 0640'), 'tmpfiles configuration must enforce private sync storage permissions.');
  });

  await capture('python service', async () => {
    const serverUrl = new URL('../../../server/', import.meta.url);
    const entries = await readdir(serverUrl, { recursive: true });
    const pythonFiles = entries.filter((entry) => entry.endsWith('.py'));
    assert(pythonFiles.length > 0, 'No Python service source was found under server/.');
    const pythonSource = (await Promise.all(
      pythonFiles.map((entry) => readFile(new URL(entry.replaceAll('\\', '/'), serverUrl), 'utf8'))
    )).join('\n');

    assert(pythonSource.includes('DEFAULT_PACKY_IMAGE_ENDPOINT = "https://www.packyapi.com/v1/images/edits"'), 'Python image service must default to the verified Packy edits endpoint.');
    assert(pythonSource.includes('DEFAULT_PACKY_IMAGE_MODEL = "gpt-image-2"'), 'Python image service must default to gpt-image-2.');
    assert(pythonSource.includes('PACKY_REQUEST_TIMEOUT_SECONDS = 300'), 'Python image service must use the verified 300-second Packy upstream timeout.');
    assert(pythonSource.includes('MAX_PACKY_RESPONSE_BYTES = 32 * 1024 * 1024'), 'Python image service must cap Packy JSON responses while allowing Base64 image results.');
    for (const envName of ['PACKY_API_TOKEN', 'PACKY_IMAGE_ENDPOINT', 'PACKY_IMAGE_MODEL']) {
      assert(pythonSource.includes(envName), `Python image service must read ${envName} from the environment.`);
    }
    assert(/\/api\/image\/generate/.test(pythonSource), 'Python image service must expose POST /api/image/generate.');
    assert(
      /(?:IMAGE|PACKY)(?:_[A-Z]+)*_(?:DIR|PATH)/.test(pythonSource)
        && /(?:open\s*\([^\n]+["']wb["']|write_bytes\s*\(|os\.replace\s*\()/i.test(pythonSource),
      'Python image service must download generated images into a durable image asset path.'
    );
    assert(
      /download_generated_image\s*\(/.test(pythonSource)
        && /save_image_asset\s*\(/.test(pythonSource)
        && /IMAGE_ASSET_PREFIX/.test(pythonSource),
      'Python image service must immediately download the 24-hour upstream URL and return a durable local asset path.'
    );
    assert(
      /(?:ALLOWED|SUPPORTED|VALID|PACKY_IMAGE)(?:_[A-Z]+)*_SIZES?/.test(pythonSource)
        && /size\s+not\s+in\s+(?:backend_config\.)?[A-Z][A-Z0-9_]*SIZES/.test(pythonSource),
      'Python image service must define and enforce an explicit image size whitelist.'
    );
    for (const size of ['1024x1024', '1536x1024', '1024x1536', '2048*2048', '2688*1536', '1536*2688', '2368*1728', '1728*2368']) {
      assert(pythonSource.includes(size), `Python image service size whitelist is missing ${size}.`);
    }
    assert(/IMAGE(?:_[A-Z]+)*_TOKEN|IMAGE_TOKEN/.test(pythonSource), 'Python image service must use a dedicated image token setting.');
    assert(/Authorization|X-OpenTavern-Image-Token|Bearer/i.test(pythonSource), 'Python image endpoint must authenticate requests with an image token header.');
    assert(/validate_packy_image_url/.test(pythonSource) && /class\s+PackyImageRedirectHandler/.test(pythonSource), 'Python image downloads and redirects must pass Packy URL validation.');
    assert(/dimensions do not match the requested size/.test(pythonSource), 'Python image service must verify downloaded image dimensions.');
    assert(/referenceImage|reference_image/.test(pythonSource), 'Python image service must accept a character-card reference image.');
    assert(/def\s+call_packy_image_api\s*\(/.test(pythonSource) && /def\s+build_packy_multipart_body\s*\(/.test(pythonSource), 'Python image service must call Packy through a dedicated multipart adapter.');
    for (const field of ['model', 'prompt', 'size', 'quality', 'output_format']) {
      assert(pythonSource.includes(`add_field("${field}"`), `Packy multipart request is missing the ${field} field.`);
    }
    assert(/name=["']image["']/.test(pythonSource), 'Packy multipart request must include the character-card image file field.');
    assert(!pythonSource.includes('add_field("response_format"'), 'Packy multipart request must not send the rejected response_format field.');
    assert(pythonSource.includes('first_image.get("b64_json")'), 'Packy response parser must support the verified b64_json result.');
    assert(/provider=["']packy["']/.test(pythonSource) && /PACKY_[A-Z_]+/.test(pythonSource), 'Packy failures must retain provider and PACKY_ error metadata for the frontend.');
  });

  if (imageModuleFiles.length > 0) {
    await capture('frontend behavior', async () => {
      const sources = await Promise.all(
        imageModuleFiles.map((file) => readFile(new URL(`../../../src/app/${file}`, import.meta.url), 'utf8'))
      );
      sources.unshift(messageIdentitySource);
      const events = [];
      const requests = [];
      const messageInput = { value: 'current input: sunset on the academy rooftop' };
      const genericElement = {
        value: '',
        textContent: '',
        innerHTML: '',
        disabled: false,
        checked: false,
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        removeAttribute() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {},
      };
      const imageGenerationStatus = { ...genericElement, textContent: '' };
      const character = {
        id: 'arona',
        name: 'Arona',
        previewImage: '/cards/arona.png',
        description: 'blue-haired academy guide with a halo',
        personality: 'cheerful and helpful',
        scenario: 'Kivotos academy city',
      };
      const conversationCharacter = { ...character, previewImage: '/cards/arona-old.png' };
      const conv = {
        id: 'c1',
        title: 'Rooftop scene',
        characterId: 'arona',
        character: conversationCharacter,
        messages: [
          { role: 'user', content: 'older user message' },
          {
            id: 'main-latest',
            role: 'assistant',
            stage: 'main',
            content: 'recent main body: wind lifts the papers into golden light\n<details>hidden status</details>\n<options><option>second-stage choice that must be excluded</option></options>',
          },
          { id: 'second-latest', role: 'assistant', stage: 'second', parentId: 'main-latest', content: '<options><option>visible second-stage option</option></options>' },
          { role: 'assistant', content: '', attachments: [{ type: 'image', source: 'qwen-image', url: '/api/image/assets/old' }] },
        ],
        updated: 0,
        _lastRenderedVisibleCount: 4,
      };
      const responseImage = {
        assetId: 'asset-packy-123',
        id: 'asset-packy-123',
        url: '/api/image/assets/asset-packy-123.png',
        imageUrl: '/api/image/assets/asset-packy-123.png',
        mime: 'image/png',
        mimeType: 'image/png',
        model: 'gpt-image-2',
        provider: 'packy',
        width: 1024,
        height: 1024,
        source: 'packy-gpt-image',
      };
      let responsePayload = {
        success: true,
        ...responseImage,
        image: { ...responseImage },
        asset: { ...responseImage },
        data: { ...responseImage },
      };
      let summaryResponsePayload = {
        choices: [{
          finish_reason: 'stop',
          message: { content: 'summarized safe scene: Arona on a golden rooftop, cinematic light' },
        }],
      };
      const cryptoMock = {
        subtle: webcrypto.subtle,
        getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
        randomUUID: () => '00000000-0000-4000-8000-000000000001',
      };
      const canvases = [];
      const makeCanvasMock = () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return { fillStyle: '', fillRect() {}, drawImage() {} };
          },
          toBlob(callback) {
            callback(new Blob([Uint8Array.from([255, 216, 255, 217])], { type: 'image/jpeg' }));
          },
        };
        canvases.push(canvas);
        return canvas;
      };
      const documentMock = {
        body: genericElement,
        getElementById(id) { return id === 'messageInput' ? messageInput : genericElement; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        createElement(tagName) { return String(tagName).toLowerCase() === 'canvas' ? makeCanvasMock() : { ...genericElement }; },
        addEventListener() {},
        removeEventListener() {},
      };
      const context = {
        state: {
          settings: {
            imageGenerationEnabled: true,
            imageGenerationEndpoint: '/api/image/generate',
            imageGenerationToken: 'valid-image-token',
            imageGenerationSize: '1024x1024',
            imageGenerationStylePrompt: '画面中的人物均为二次元角色，整体参考《碧蓝档案》的高质量日系动画插画风格。',
            imageGenerationNegativePrompt: 'low quality, blurry text',
            imageGenerationPromptExtend: true,
            imageGenerationUseCharacter: true,
            imageGenerationUseChatContext: true,
            userName: 'Sensei',
            apiEndpoint: 'https://text.example/v1/chat/completions',
            apiKey: 'text-api-key',
            model: 'text-model',
            summarizeUseMainAPI: true,
          },
          conversations: { c1: conv },
          conversationOrder: ['c1'],
          activeConvId: 'c1',
          characters: { arona: character },
          isGenerating: false,
        },
        dom: new Proxy({ messageInput, imageGenerationStatus }, { get(target, property) { return target[property] || genericElement; } }),
        document: documentMock,
        window: {
          document: documentMock,
          crypto: cryptoMock,
          location: { origin: 'https://example.com', protocol: 'https:', host: 'example.com', href: 'https://example.com/' },
          showGlassAlert(message) { events.push(`alert:${message}`); },
        },
        navigator: { storage: {} },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        crypto: cryptoMock,
        getActiveConv() { return conv; },
        getActiveConversation() { return conv; },
        getCurrentCharacter() { return character; },
        isGroupChat(target) { return !!(target && target.group && Array.isArray(target.group.members) && target.group.members.length >= 2); },
        getGroupMembers(target) { return target && target.group && Array.isArray(target.group.members) ? target.group.members : []; },
        async persistState() { events.push('persist'); },
        async saveConversation() { events.push('persist'); },
        StorageService: { async saveAll() { events.push('persist'); } },
        renderMessagesOnly() { events.push('messages'); },
        renderConversationListOnly() { events.push('conversations'); },
        requestFullRender() { events.push('render'); },
        updateInputState() { events.push('input-state'); },
        appStore: { notify() { events.push('notify'); } },
        showGlassAlert(message) { events.push(`alert:${message}`); },
        showToast(message) { events.push(`toast:${message}`); },
        t(key) { return key; },
        normalizeApiEndpoint(value) { return String(value || ''); },
        shouldUseOllamaCompat() { return false; },
        normalizeMessagesForOllamaCompatibility(messages) { return messages; },
        async fetch(input, options = {}) {
          let url = String(input);
          let method = options.method || 'GET';
          let body = options.body;
          let headers = options.headers || {};
          if (typeof Request !== 'undefined' && input instanceof Request) {
            url = input.url;
            method = input.method;
            body = await input.clone().text();
            headers = Object.fromEntries(input.headers.entries());
          }
          requests.push({ url, method, body, headers });
          if (/\/api\/image\/generate(?:\?|$)/.test(url)) {
            return new Response(JSON.stringify(responsePayload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (url === 'https://text.example/v1/chat/completions') {
            return new Response(JSON.stringify(summaryResponsePayload), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(Uint8Array.from([137, 80, 78, 71]), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          });
        },
        FileReader: class {
          readAsDataURL() { this.result = 'data:image/jpeg;base64,/9j/2Q=='; if (this.onload) this.onload(); }
        },
        async createImageBitmap() { return { width: 1024, height: 1536, close() {} }; },
        Response,
        Request,
        Headers,
        Blob,
        FormData,
        URL,
        URLSearchParams,
        AbortController,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        ArrayBuffer,
        Promise,
        JSON,
        Date,
        Math,
        Number,
        Object,
        String,
        Array,
        RegExp,
        Error,
        TypeError,
        console,
        setTimeout,
        clearTimeout,
        queueMicrotask,
        encodeURIComponent,
        decodeURIComponent,
        btoa(text) { return Buffer.from(text, 'binary').toString('base64'); },
        atob(text) { return Buffer.from(text, 'base64').toString('binary'); },
      };

      vm.runInNewContext(`${sources.join('\n')}\nthis.__generateImage = generateImageForCurrentChat;\nthis.__buildImagePrompt = buildImageGenerationPrompt;\nthis.__createImageMessage = createImageGenerationMessage;\nthis.__legacyCreateImageMessage = createQwenImageMessage;\nthis.__normalizeImageEndpoint = normalizeImageGenerationEndpoint;\nthis.__normalizeImageSize = normalizeImageGenerationSize;\nthis.__createImageError = createImageGenerationRequestError;\nthis.__formatImageError = formatImageGenerationError;\nthis.__requestImage = requestImageGeneration;\nthis.__legacyRequestImage = requestQwenImageGeneration;\nthis.__latestMainMessage = getLatestPrimaryAssistantImageGenerationMessage;\nthis.__latestMainText = getLatestAssistantImageGenerationText;\nthis.__referenceDescriptor = getImageGenerationReferenceDescriptor;\nthis.__buildImageSummaryMessages = buildImageGenerationSummaryMessages;\nthis.__prepareImageReference = prepareImageGenerationReferenceImage;\nthis.__readImageReferenceDataUrl = readImageGenerationReferenceBlobAsDataUrl;\nthis.__cleanPrimaryImageText = cleanPrimaryImageGenerationText;\nthis.__appendStylePrompt = appendImageGenerationStylePrompt;`, context);

      assert(typeof context.__generateImage === 'function', 'Image modules must expose the public chat generator.');
      assert(typeof context.__buildImagePrompt === 'function', 'Image modules must expose the provider-neutral prompt builder.');
      assert(typeof context.__createImageMessage === 'function', 'Image modules must expose the provider-neutral message factory.');
      assert(typeof context.__legacyCreateImageMessage === 'function' && typeof context.__legacyRequestImage === 'function', 'Old Qwen-specific public function names must remain as compatibility aliases.');
      assert(context.__normalizeImageEndpoint('/api/image/generate') === '/api/image/generate', 'Image endpoint normalization must preserve same-origin paths.');
      assert(context.__normalizeImageEndpoint('https://image.example/generate') === 'https://image.example/generate', 'Image endpoint normalization must preserve explicit HTTPS endpoints.');
      assert(context.__normalizeImageSize('1024*1024') === '1024x1024', 'New Packy dimensions should normalize to the canonical x separator.');
      assert(context.__normalizeImageSize('2368*1728') === '2368*1728', 'Historical Qwen dimensions must remain unchanged for gateway compatibility.');
      for (const unsafeEndpoint of ['javascript:alert(1)', 'data:text/plain,token', 'file:///tmp/image', '//evil.example/steal']) {
        assert(context.__normalizeImageEndpoint(unsafeEndpoint) === '/api/image/generate', `Unsafe image endpoint was not rejected: ${unsafeEndpoint}`);
      }

      const originalFetch = context.fetch;
      let oversizedBlobRead = false;
      let oversizedBodyCancelled = false;
      context.fetch = async () => ({
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return String(name).toLowerCase() === 'content-length'
              ? String((32 * 1024 * 1024) + 1)
              : null;
          },
        },
        body: { cancel() { oversizedBodyCancelled = true; return Promise.resolve(); } },
        async blob() {
          oversizedBlobRead = true;
          return new Blob([Uint8Array.from([1])], { type: 'image/png' });
        },
      });
      await assertRejects(
        context.__prepareImageReference({ source: '/cards/oversized.png' }, null),
        'Image reference preprocessing must reject an oversized Content-Length before buffering the body.',
      );
      assert(!oversizedBlobRead && oversizedBodyCancelled, 'Oversized character images must be cancelled before response.blob() allocates memory.');
      context.fetch = originalFetch;

      const originalCreateImageBitmap = context.createImageBitmap;
      let oversizedBitmapClosed = false;
      context.createImageBitmap = async () => ({
        width: 8192,
        height: 8192,
        close() { oversizedBitmapClosed = true; },
      });
      await assertRejects(
        context.__prepareImageReference({ source: '/cards/high-pixel-count.png' }, null),
        'Image reference preprocessing must reject decoded images above the total-pixel limit.',
      );
      assert(oversizedBitmapClosed, 'Rejected high-pixel-count bitmaps must be closed immediately.');
      context.createImageBitmap = originalCreateImageBitmap;

      const OriginalFileReader = context.FileReader;
      let fileReaderAbortCalled = false;
      context.FileReader = class {
        readAsDataURL() {}
        abort() {
          fileReaderAbortCalled = true;
          if (this.onabort) this.onabort();
        }
      };
      const readAbortController = new AbortController();
      const pendingRead = context.__readImageReferenceDataUrl(
        new Blob([Uint8Array.from([1, 2, 3])]),
        readAbortController.signal,
      );
      readAbortController.abort();
      await assertRejects(pendingRead, 'Aborting image generation must stop an active FileReader.');
      assert(fileReaderAbortCalled, 'Image reference FileReader must receive abort() when generation is cancelled.');
      context.FileReader = OriginalFileReader;

      const latestMainMessage = context.__latestMainMessage(conv);
      const latestMainText = context.__latestMainText(conv);
      assert(latestMainMessage && latestMainMessage.id === 'main-latest', 'Image generation must select the latest main-stage assistant reply.');
      assert(latestMainText.includes('recent main body'), 'Image generation must collect the latest main reply body.');
      assert(!latestMainText.includes('hidden status') && !latestMainText.includes('option'), 'Image generation must remove details/status and second-stage option blocks.');
      assert(!latestMainText.includes(messageInput.value), 'Composer input must not replace the collected main reply body.');
      assert(context.__cleanPrimaryImageText('main body\n<OPTIONS><option>dangling choice') === 'main body', 'Dangling second-stage option blocks must be truncated from image-summary input.');
      assert(context.__cleanPrimaryImageText('main body\n<details>dangling status') === 'main body', 'Dangling details/status blocks must be truncated from image-summary input.');
      assert(context.__buildImagePrompt(conv) === latestMainText.slice(0, 5000), 'Legacy image prompt entrypoint must also return only the latest main reply body.');
      const singleReference = context.__referenceDescriptor(conv, latestMainMessage);
      assert(singleReference.source === '/cards/arona.png', 'Image generation must prefer the latest registered role-card image over a stale conversation clone.');

      const mika = { name: 'Mika', previewImage: '/cards/mika.png' };
      context.state.characters.mika = mika;
      const groupMain = { id: 'group-main', role: 'assistant', stage: 'main', speaker: 'Mika', content: 'group main body' };
      const groupConv = {
        group: { members: [{ character }, { character: mika }] },
        messages: [groupMain],
      };
      assert(context.__referenceDescriptor(groupConv, groupMain).source === '/cards/mika.png', 'Group image generation must use the latest main reply speaker role-card image.');

      const summaryMessages = context.__buildImageSummaryMessages(latestMainText, 'use a low-angle camera');
      const summaryInput = JSON.parse(summaryMessages[1].content);
      assert(summaryInput.latestMainReply === latestMainText, 'Image summary request must contain only the cleaned latest main reply.');
      assert(summaryInput.userSupplement === 'use a low-angle camera', 'Image summary request may include only an explicit optional supplement.');
      assert(!/unrestricted|ignore (?:all )?(?:filters|safety)/i.test(summaryMessages[0].content), 'Image summary system prompt must not attempt to bypass safety filters.');

      const packyError = context.__createImageError(502, {
        success: false,
        error: 'Packy GPT Image generation failed.',
        provider: 'packy',
        code: 'PACKY_UPSTREAM_FAILED',
        upstreamCode: 'DataInspectionFailed',
        reason: 'Input data may contain inappropriate content.',
        requestId: 'request-error-123',
        upstreamStatus: 400,
      });
      const packyErrorText = context.__formatImageError(packyError);
      assert(packyErrorText.includes('Input data may contain inappropriate content.'), 'Packy failure UI must include the upstream failure reason.');
      assert(packyErrorText.includes('DataInspectionFailed'), 'Packy failure UI must include the upstream error code.');
      assert(packyErrorText.includes('request-error-123'), 'Packy failure UI must include the upstream request ID.');

      const credentialError = context.__createImageError(502, {
        provider: 'packy',
        reason: 'Signature=signature-secret AccessKeyId=access-secret SecurityToken=security-secret Credential=credential-secret',
      });
      const credentialErrorText = context.__formatImageError(credentialError);
      for (const secret of ['signature-secret', 'access-secret', 'security-secret', 'credential-secret']) {
        assert(!credentialErrorText.includes(secret), `Image failure UI must redact signed credential field: ${secret}`);
      }
      const imageEchoError = context.__createImageError(502, {
        provider: 'packy',
        reason: 'echoed data:image/jpeg;base64,QUJDREVGR0g=',
      });
      assert(!context.__formatImageError(imageEchoError).includes('QUJDREVGR0g'), 'Image failure UI must redact echoed reference-image data URLs.');
      const foldedImageEchoError = context.__createImageError(502, {
        provider: 'packy',
        reason: 'echoed data:image/jpeg;base64,QUJD\r\nREVGR0hJSktMTU5PUA==',
      });
      const foldedImageEchoText = context.__formatImageError(foldedImageEchoError);
      assert(!foldedImageEchoText.includes('QUJD') && !foldedImageEchoText.includes('REVGR0hJSktMTU5PUA'), 'Image failure UI must redact folded reference-image data URLs completely.');

      const unauthorizedError = context.__createImageError(401, {
        error: 'Invalid token: secret-token-value',
        reason: 'Authorization: Bearer secret-token-value',
        requestId: 'request-auth',
      });
      const unauthorizedText = context.__formatImageError(unauthorizedError);
      assert(unauthorizedText === '图片服务拒绝访问，请检查访问令牌。', 'Image gateway 401 must keep the safe access-token guidance.');
      assert(!unauthorizedText.includes('secret-token-value'), 'Image gateway 401 must not expose response credentials.');

      const htmlError = context.__createImageError(502, null, '<html><body>proxy failure</body></html>');
      assert(!String(htmlError.message).includes('proxy failure'), 'Non-JSON proxy responses must not be displayed as image failure reasons.');

      const initialMessageCount = conv.messages.length;
      const generatedResult = await context.__generateImage();
      assert(canvases.length > 0 && canvases.every((canvas) => canvas.width === 1 && canvas.height === 1), 'Character-image canvases must release their backing buffers after encoding.');
      const summaryRequest = requests.find((entry) => entry.url === 'https://text.example/v1/chat/completions');
      assert(summaryRequest, 'Image generation must summarize the latest main reply with the configured text model.');
      let summaryRequestBody = summaryRequest.body;
      if (typeof summaryRequestBody === 'string') summaryRequestBody = JSON.parse(summaryRequestBody);
      assert(summaryRequestBody.model === 'text-model', 'Image scene summarization must use the configured text model.');
      assert(summaryRequestBody.max_tokens === 1300, 'Image scene summarization must cap output at 1300 tokens.');
      assert(summaryRequestBody.stream === false, 'Image scene summarization must use a non-streaming request.');
      const summaryPayloadInput = JSON.parse(summaryRequestBody.messages[1].content);
      assert(summaryPayloadInput.latestMainReply.includes('recent main body'), 'Summary input must contain the latest main reply.');
      assert(!summaryPayloadInput.latestMainReply.includes('option') && !summaryPayloadInput.latestMainReply.includes('hidden status'), 'Summary input must exclude second-stage options and details/status content.');
      assert(!summaryPayloadInput.latestMainReply.includes('older user message') && !summaryPayloadInput.latestMainReply.includes(messageInput.value), 'Summary input must not include older history or the composer text.');
      assert(!summaryRequestBody.messages.some((message) => String(message.content || '').includes('碧蓝档案')), 'The default image style must not be mixed into the source-text summarization request.');

      const generateRequest = requests.find((entry) => /\/api\/image\/generate(?:\?|$)/.test(entry.url));
      assert(generateRequest, 'generateImageForCurrentChat must call POST /api/image/generate.');
      assert(String(generateRequest.method).toUpperCase() === 'POST', 'Image generation request must use POST.');
      let requestBody = generateRequest.body;
      if (typeof requestBody === 'string') requestBody = JSON.parse(requestBody);
      assert(requestBody && typeof requestBody === 'object', 'Image generation request must send a JSON body.');
      assert(requestBody.size === '1024x1024', 'Packy image generation request must include the selected canonical size.');
      assert(!Object.prototype.hasOwnProperty.call(requestBody, 'negativePrompt'), 'Packy image generation request must not send the unsupported negativePrompt field.');
      assert(!Object.prototype.hasOwnProperty.call(requestBody, 'promptExtend'), 'Packy image generation request must not send the unsupported promptExtend field.');
      assert(generateRequest.headers['X-OpenTavern-Image-Token'] === 'valid-image-token', 'Image generation must send the dedicated image gateway token header.');
      assert(!generateRequest.headers['X-OpenTavern-Token'], 'Image generation must not reuse the cloud sync token header.');
      const sentPrompt = String(requestBody.prompt || '');
      assert(sentPrompt.startsWith('summarized safe scene: Arona on a golden rooftop, cinematic light'), 'Packy prompt must start with the text-model summary.');
      assert(sentPrompt.includes('风格要求：') && sentPrompt.includes('碧蓝档案'), 'Packy prompt must append the configured style only after summarization.');
      assert(sentPrompt.length <= 5000, 'The final Packy prompt must respect the frontend length limit.');
      assert(/^data:image\/jpeg;base64,/i.test(String(requestBody.referenceImage || '')), 'Image request must include the rasterized character-card image.');
      assert(requests.indexOf(summaryRequest) < requests.indexOf(generateRequest), 'The image request must wait for the text-model summary.');

      const resultMessages = generatedResult && Array.isArray(generatedResult.messages)
        ? generatedResult.messages
        : generatedResult && generatedResult.message
          ? [generatedResult.message]
          : generatedResult && Array.isArray(generatedResult.attachments)
            ? [generatedResult]
            : [];
      const createdMessages = conv.messages.slice(initialMessageCount).concat(resultMessages);
      const createdAttachment = createdMessages
        .flatMap((message) => Array.isArray(message && message.attachments) ? message.attachments : [])
        .find((attachment) => attachment && attachment.source === 'packy-gpt-image');
      assert(createdAttachment, 'Successful Packy generation must create a source=packy-gpt-image attachment.');
      assert(
        createdAttachment.assetId === 'asset-packy-123'
          || createdAttachment.url === '/api/image/assets/asset-packy-123.png'
          || createdAttachment.imageUrl === '/api/image/assets/asset-packy-123.png',
        'Packy image attachment must retain the durable server asset reference.'
      );
      assert(createdAttachment.prompt === sentPrompt, 'Saved Packy attachment must retain the final summarized-and-styled image prompt.');
      assert(createdAttachment.sourceMessageId === 'main-latest', 'Saved Packy attachment must retain the source main-message ID.');
      assert(createdAttachment.referenceCharacterName === 'Arona', 'Saved Packy attachment must retain the reference character name.');
      assert(!Object.prototype.hasOwnProperty.call(createdAttachment, 'negativePrompt') && !Object.prototype.hasOwnProperty.call(createdAttachment, 'promptExtend'), 'New Packy attachments must not claim unsupported Qwen options were applied.');
      assert(events.includes('persist'), 'Successful Packy generation must persist the new image message.');

      responsePayload = {
        success: false,
        error: 'Packy GPT Image generation failed.',
        provider: 'packy',
        code: 'PACKY_NO_IMAGE',
        upstreamCode: 'DataInspectionFailed',
        reason: 'The prompt was rejected by the content policy.',
        requestId: 'request-runtime-failure',
      };
      let directFailure = null;
      try {
        await context.__requestImage({ prompt: 'blocked prompt' });
      } catch (error) {
        directFailure = error;
      }
      assert(directFailure && directFailure.reason === 'The prompt was rejected by the content policy.', 'HTTP 200 success=false must reject with the Packy failure reason.');

      const messagesBeforeFailure = conv.messages.length;
      const persistEventsBeforeFailure = events.filter((event) => event === 'persist').length;
      await context.__generateImage();
      assert(conv.messages.length === messagesBeforeFailure, 'Failed Packy generation must not append a chat message.');
      assert(events.filter((event) => event === 'persist').length === persistEventsBeforeFailure, 'Failed Packy generation must not persist a new message.');
      assert(
        String(imageGenerationStatus.textContent).includes('The prompt was rejected by the content policy.'),
        `Failed Packy generation must show the upstream reason in the panel status (actual: ${String(imageGenerationStatus.textContent)}).`
      );

      summaryResponsePayload = {
        choices: [{ finish_reason: 'stop', message: { content: 'CANNOT_CREATE_SAFE_IMAGE_PROMPT' } }],
      };
      const generateCountBeforeUnsafeSummary = requests.filter((entry) => /\/api\/image\/generate(?:\?|$)/.test(entry.url)).length;
      const messagesBeforeUnsafeSummary = conv.messages.length;
      await context.__generateImage();
      assert(
        requests.filter((entry) => /\/api\/image\/generate(?:\?|$)/.test(entry.url)).length === generateCountBeforeUnsafeSummary,
        'Unsafe or unsummarizable main text must block the Packy image request.'
      );
      assert(conv.messages.length === messagesBeforeUnsafeSummary, 'Blocked image-summary content must not append a chat message.');
      assert(String(imageGenerationStatus.textContent).includes('无法安全改写'), 'Blocked image-summary content must show a clear safe-rewrite error.');

      const savedRegistryImage = character.previewImage;
      const savedConversationImage = conversationCharacter.previewImage;
      character.previewImage = '';
      conversationCharacter.previewImage = '';
      const requestCountBeforeMissingImage = requests.length;
      await context.__generateImage();
      assert(requests.length === requestCountBeforeMissingImage, 'Missing role-card images must block both summary and image requests.');
      assert(String(imageGenerationStatus.textContent).includes('没有可用图片'), 'Missing role-card images must show a clear error.');
      character.previewImage = savedRegistryImage;
      conversationCharacter.previewImage = savedConversationImage;
    });
  }

  assert(failures.length === 0, `Packy image generation contract failed:\n- ${failures.join('\n- ')}`);
}
export { assertPackyImageGenerationContract };
