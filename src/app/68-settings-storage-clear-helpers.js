/**
 * 新手导读（文件：68-settings-storage-clear-helpers.js）
 *
 * 负责什么：这是“设置界面”中的“设置、存储、清理、辅助函数”部分。
 * 在程序中的位置：它把当前设置填入表单，读取用户修改，再触发保存后的联动效果。
 * 从哪里开始看：主要从 `getClearAllStorageButtonStyle(backend)`、`applyClearAllStorageButtonState(clearBtn, backend)`、`getClearAllStorageConfirmConfig(无参数)`、`getClearWebLLMCacheConfirmConfig(无参数)`、`renderStorageUsageClearedState(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：表单值都是字符串或勾选状态，写回前要转换成正确的数字、布尔值和枚举。
 */
// 存储清理辅助：生成清理按钮样式、确认文案和危险操作配置。
function getClearAllStorageButtonStyle(backend) {
    if (backend === 'idb') {
        return { background: 'rgba(239,68,68,0.15)', color: '' };
    }
    return { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' };
}

function applyClearAllStorageButtonState(clearBtn, backend) {
    clearBtn.style.display = 'flex';
    clearBtn.textContent = t('clear_opfs_data') || '\u6e05\u9664\u6240\u6709\u7528\u6237\u6570\u636e\uff08OPFS + LS \u5feb\u7167\uff09';

    var style = getClearAllStorageButtonStyle(backend);
    clearBtn.style.background = style.background;
    clearBtn.style.color = style.color;
}

function getClearAllStorageConfirmConfig() {
    return {
        message: '\u786e\u5b9a\u8981\u6c38\u4e45\u5220\u9664\u6240\u6709\u7528\u6237\u6570\u636e\u5417\uff1f\n\u5305\u62ec\u89d2\u8272\u5361\u3001\u5bf9\u8bdd\u3001\u4e16\u754c\u4e66\u3001WebLLM \u6a21\u578b\u7f13\u5b58\u7b49\u3002\n\u6b64\u64cd\u4f5c\u4e0d\u53ef\u6062\u590d\uff0c\u9875\u9762\u5c06\u91cd\u65b0\u52a0\u8f7d\u3002',
        options: { title: '\u6e05\u9664\u6240\u6709\u7528\u6237\u6570\u636e', danger: true, okText: '\u6c38\u4e45\u5220\u9664' }
    };
}

function getClearWebLLMCacheConfirmConfig() {
    return {
        message: '\u786e\u5b9a\u8981\u6e05\u9664 WebLLM \u4e0b\u8f7d\u7684\u6a21\u578b\u7f13\u5b58\u5417\uff1f\n\u8fd9\u4f1a\u91ca\u653e\u5927\u91cf\u7a7a\u95f4\uff0c\u4f46\u4e0b\u6b21\u4f7f\u7528\u672c\u5730\u6a21\u578b\u65f6\u9700\u8981\u91cd\u65b0\u4e0b\u8f7d\u3002',
        options: { title: '\u6e05\u9664 WebLLM \u6a21\u578b\u7f13\u5b58', okText: '\u6e05\u9664' }
    };
}

function renderStorageUsageClearedState() {
    if (typeof updateStorageInfo === 'function') updateStorageInfo();
    var usageEl = document.getElementById('storageUsage');
    var bar = document.getElementById('storageUsageBar');
    if (usageEl) usageEl.textContent = '0.0 MB / ~0 GB (\u5df2\u6e05\u9664)';
    if (bar) bar.style.width = '0%';
}
