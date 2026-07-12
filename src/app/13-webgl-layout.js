/**
 * 新手导读（文件：13-webgl-layout.js）
 *
 * 负责什么：这是“WebGL 动态背景”中的“WebGL 背景、画布布局”部分。
 * 在程序中的位置：它初始化绘图程序，并根据窗口大小和主题持续刷新背景。
 * 从哪里开始看：主要从 `resizeShaderCanvas(canvas, glContext, resolutionLocation)`、`updateAppHeight(无参数)`、`isShaderPausedByTheme(无参数)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：着色器代码运行在 GPU 上；语法错误可能只表现为背景消失。
 */
// ==================== WebGL Layout Helpers ====================
function resizeShaderCanvas(canvas, glContext, resolutionLocation) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    glContext.viewport(0, 0, canvas.width, canvas.height);
    if (resolutionLocation) glContext.uniform2f(resolutionLocation, canvas.width, canvas.height);
}

function updateAppHeight() {
    var h = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');
}

function isShaderPausedByTheme() {
    return document.body && (
        document.body.classList.contains('theme-new-light') ||
        document.body.classList.contains('theme-new-dark')
    );
}
