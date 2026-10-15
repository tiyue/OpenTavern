/**
 * 新手导读（文件：60-library-card-grid-ui.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、角色卡、网格、界面”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `triggerCardImageUpload(char)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 角色卡网格兼容门面：处理角色图片上传等跨网格公共操作。
function triggerCardImageUpload(char) {
    if (!char || !char.name) return;
    const input = createCardImageUploadInput();
    input.onchange = function() {
        const file = getCardImageUploadFile(input);
        if (!file) {
            removeCardImageUploadInput(input);
            return;
        }
        readCardImageUploadFile(file, function(dataUrl) {
            saveMyCharacterPreviewImage(char, dataUrl);
            removeCardImageUploadInput(input);
        }, function() {
            removeCardImageUploadInput(input);
        });
    };
    input.click();
}
