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
