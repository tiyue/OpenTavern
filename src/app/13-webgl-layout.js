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
