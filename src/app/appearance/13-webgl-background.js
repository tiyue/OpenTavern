/**
 * 新手导读（文件：13-webgl-background.js）
 *
 * 负责什么：这是“WebGL 动态背景”中的“WebGL 背景”部分。
 * 在程序中的位置：它初始化绘图程序，并根据窗口大小和主题持续刷新背景。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：着色器代码运行在 GPU 上；语法错误可能只表现为背景消失。
 */
// ==================== WebGL Background ====================
var shaderCanvas = document.getElementById('shaderCanvas');
var gl = shaderCanvas ? (shaderCanvas.getContext('webgl') || shaderCanvas.getContext('experimental-webgl')) : null;

if (gl) {
    var vertexShader = createWebGLShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER_SOURCE);
    var fragmentShader = createWebGLShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER_SOURCE);
    var program = createWebGLProgram(gl, vertexShader, fragmentShader);

    if (program) {
        gl.useProgram(program);
        setupWebGLFullscreenQuad(gl, program);
        var shaderUniforms = getWebGLBackgroundUniforms(gl, program);

        function resizeShader() {
            resizeShaderCanvas(shaderCanvas, gl, shaderUniforms.resolution);
        }
        window.addEventListener('resize', resizeShader);
        resizeShader();

        window.addEventListener('resize', updateAppHeight);
        window.addEventListener('orientationchange', updateAppHeight);
        setTimeout(updateAppHeight, 0);

        var shaderStartTime = performance.now();
        var shaderAnimationFrame = null;

        function renderShader(now) {
            if (document.hidden) {
                shaderAnimationFrame = null;
                return;
            }
            if (window.__lowPowerMode) {
                shaderAnimationFrame = null;
                return;
            }
            if (shaderUniforms.time) gl.uniform1f(shaderUniforms.time, (now - shaderStartTime) / 1000.0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            shaderAnimationFrame = requestAnimationFrame(renderShader);
        }

        function startShaderAnimation() {
            if (!shaderAnimationFrame && !window.__lowPowerMode && !isShaderPausedByTheme()) {
                shaderAnimationFrame = requestAnimationFrame(renderShader);
            }
        }

        function pauseShader() {
            window.__lowPowerMode = true;
            if (shaderAnimationFrame) {
                cancelAnimationFrame(shaderAnimationFrame);
                shaderAnimationFrame = null;
            }
            if (shaderCanvas) shaderCanvas.style.display = 'none';
        }

        function resumeShader() {
            window.__lowPowerMode = false;
            if (shaderCanvas) shaderCanvas.style.display = '';
            if (gl && !shaderAnimationFrame) {
                startShaderAnimation();
            }
        }

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && !window.__lowPowerMode && !isShaderPausedByTheme()) {
                startShaderAnimation();
            }
        });

        startShaderAnimation();

        window.__pauseShader = pauseShader;
        window.__resumeShader = resumeShader;
    }
}
