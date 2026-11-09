/**
 * 新手导读（文件：21-content-module-media.js）
 *
 * 负责什么：模块本地素材的有界读取、位图签名/MIME 校验、真实解码和 data URL 保存。
 * 在程序中的位置：管理界面新建/导入模块时调用；运行时的素材预览只使用模块里已保存的字节。
 * 从哪里开始看：`prepareContentModuleAssetFromFile(file)`、`prepareContentModuleAssetFromUrl(url)`、
 * `verifyContentModuleAsset(asset)`。
 * 修改时注意：只接受 PNG/JPEG/WebP/GIF 位图；HTML/SVG/脚本伪装成图片必须拒绝。
 */
// ==================== Content Module Local Media ====================
var CONTENT_MODULE_MAX_ASSET_BYTES = 1024 * 1024;
var CONTENT_MODULE_MAX_TOTAL_ASSET_BYTES = 2 * 1024 * 1024;
var CONTENT_MODULE_MAX_ASSET_SOURCE_BYTES = 4 * 1024 * 1024;
var CONTENT_MODULE_MEDIA_ALLOWED_MIME = { 'image/png': true, 'image/jpeg': true, 'image/webp': true, 'image/gif': true };

function contentModuleFormatBytes(bytes) {
    var mib = Number(bytes) / (1024 * 1024);
    return (mib >= 1 ? Math.round(mib * 10) / 10 : Math.round(mib * 100) / 100) + ' MiB';
}

function contentModuleAssetLimit() {
    return CONTENT_MODULE_MAX_ASSET_BYTES;
}

function contentModuleTotalLimit() {
    return CONTENT_MODULE_MAX_TOTAL_ASSET_BYTES;
}

function contentModuleNormalizeAssetMime(value) {
    var mime = String(value || '').split(';')[0].trim().toLowerCase();
    return mime === 'image/jpg' ? 'image/jpeg' : mime;
}

function contentModuleValidateAssetBytes(bytes, declaredMime) {
    if (!bytes || !bytes.length || bytes.length > CONTENT_MODULE_MAX_ASSET_BYTES) {
        throw new Error(t('content_module_asset_too_large').replace('{limit}', contentModuleFormatBytes(CONTENT_MODULE_MAX_ASSET_BYTES)));
    }
    var mime = contentModuleDetectAssetMime(bytes);
    if (!mime || !CONTENT_MODULE_MEDIA_ALLOWED_MIME[mime]) throw new Error(t('content_module_asset_unsupported'));
    var declared = contentModuleNormalizeAssetMime(declaredMime);
    if (declared && declared !== mime) throw new Error(t('content_module_asset_mismatch'));
    return mime;
}

async function prepareContentModuleAssetFromFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new Error(t('content_module_asset_invalid'));
    if (file.size > CONTENT_MODULE_MAX_ASSET_SOURCE_BYTES) throw new Error(t('content_module_asset_source_too_large'));
    var bytes = new Uint8Array(await file.arrayBuffer());
    var mime = contentModuleValidateAssetBytes(bytes, file.type);
    if (typeof verifyPrivateMediaImageDecodes === 'function') await verifyPrivateMediaImageDecodes(bytes, mime);
    if (typeof readPrivateMediaBlobAsDataUrl !== 'function') throw new Error(t('content_module_media_unsupported'));
    var dataUrl = await readPrivateMediaBlobAsDataUrl(new Blob([bytes], { type: mime }));
    var decoded = contentModuleDecodeAssetDataUrl(dataUrl);
    return { id: contentModuleNewId('content-module-asset'), name: String(file.name || 'asset').slice(0, CONTENT_MODULE_MAX_NAME), mime: decoded.mime, bytes: decoded.bytes.length, dataUrl: dataUrl };
}

async function prepareContentModuleAssetFromUrl(url) {
    if (typeof downloadPrivateMediaBytes !== 'function' || typeof readPrivateMediaBlobAsDataUrl !== 'function') {
        throw new Error(t('content_module_media_unsupported'));
    }
    var downloaded = await downloadPrivateMediaBytes(url, { maxBytes: CONTENT_MODULE_MAX_ASSET_BYTES });
    var mime = contentModuleValidateAssetBytes(downloaded.bytes, downloaded.mime);
    var dataUrl = await readPrivateMediaBlobAsDataUrl(new Blob([downloaded.bytes], { type: mime }));
    var decoded = contentModuleDecodeAssetDataUrl(dataUrl);
    return { id: contentModuleNewId('content-module-asset'), name: String(url).slice(0, CONTENT_MODULE_MAX_NAME), mime: decoded.mime, bytes: decoded.bytes.length, dataUrl: dataUrl };
}

async function verifyContentModuleAsset(asset) {
    if (!asset || typeof asset.dataUrl !== 'string') throw new Error(t('content_module_asset_invalid'));
    var decoded = contentModuleDecodeAssetDataUrl(asset.dataUrl);
    if (Number(asset.bytes) !== decoded.bytes.length) throw new Error(t('content_module_asset_mismatch'));
    if (typeof verifyPrivateMediaImageDecodes === 'function') await verifyPrivateMediaImageDecodes(decoded.bytes, decoded.mime);
    return { mime: decoded.mime, bytes: decoded.bytes.length, dataUrl: asset.dataUrl };
}

function contentModuleAssetDownloadName(asset) {
    var name = String(asset && asset.name || 'content-module-asset').replace(/[\\/:*?"<>|]+/g, '-');
    var extension = asset && asset.mime === 'image/jpeg' ? '.jpg' : asset && asset.mime === 'image/webp' ? '.webp' : asset && asset.mime === 'image/gif' ? '.gif' : '.png';
    return name + extension;
}
