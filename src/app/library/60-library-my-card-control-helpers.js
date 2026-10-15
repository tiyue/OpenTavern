/**
 * 新手导读（文件：60-library-my-card-control-helpers.js）
 *
 * 负责什么：这是“资料库与角色卡界面”中的“资料库、我的、角色卡、控件、辅助函数”部分。
 * 在程序中的位置：它缓存常用页面元素，并渲染本地角色、公共角色和对应操作。
 * 从哪里开始看：主要从 `getMyCharacterCardKey(char)`、`createMyCharacterControlButton(config)`、`bindMyCharacterControlButtonClick(button, onClick)`、`getMyCharacterDeleteConfirmConfig(char)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：渲染函数可能反复运行；事件绑定和临时元素要避免重复创建。
 */
// 我的角色卡控件辅助：解析角色键并绑定图片、删除等卡片操作。
function getMyCharacterCardKey(char) {
    return (char && char.name ? char.name : '').trim().toLowerCase();
}

function createMyCharacterControlButton(config) {
    const button = document.createElement('button');
    button.className = config.className;
    button.innerHTML = config.html;
    button.title = config.title;
    bindMyCharacterControlButtonClick(button, config.onClick);
    return button;
}

function bindMyCharacterControlButtonClick(button, onClick) {
    button.addEventListener('click', function(e) {
        e.stopPropagation();
        return onClick(e);
    });
}

function getMyCharacterDeleteConfirmConfig(char) {
    const displayName = (char && char.name) || '该角色卡';
    return {
        message: `\u786e\u5b9a\u4ece\u89d2\u8272\u5e93\u4e2d\u5220\u9664\u300c${displayName}\u300d\uff1f\n\u5df2\u6709\u5bf9\u8bdd\u4e2d\u7684\u89d2\u8272\u5361\u6570\u636e\u4e0d\u4f1a\u53d7\u5f71\u54cd\u3002`,
        options: { title: '\u5220\u9664\u89d2\u8272\u5361', danger: true, okText: '\u5220\u9664' }
    };
}
