/**
 * 新手导读（文件：60-library-card-image-upload-input-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、角色卡、图片、上传、输入、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `createCardImageUploadInput(无参数)`、`removeCardImageUploadInput(input)`、`getCardImageUploadFile(input)`、`readCardImageUploadFile(file, onLoad, onError)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// ==================== Library Card Image Upload Input Helpers ====================
function createCardImageUploadInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
}

function removeCardImageUploadInput(input) {
    try { if (input && input.parentNode) input.parentNode.removeChild(input); } catch (_) {}
}

function getCardImageUploadFile(input) {
    return input && input.files && input.files[0] ? input.files[0] : null;
}

function readCardImageUploadFile(file, onLoad, onError) {
    const reader = new FileReader();
    reader.onload = function(ev) {
        onLoad(ev.target.result);
    };
    reader.onerror = onError;
    reader.readAsDataURL(file);
}
