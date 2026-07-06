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
