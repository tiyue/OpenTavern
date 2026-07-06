// ==================== WebGL Background ====================
var shaderCanvas = document.getElementById('shaderCanvas');
var gl = shaderCanvas ? (shaderCanvas.getContext('webgl') || shaderCanvas.getContext('experimental-webgl')) : null;

function createWebGLShader(glContext, type, source) {
    var shader = glContext.createShader(type);
    glContext.shaderSource(shader, source);
    glContext.compileShader(shader);
    if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
        console.warn('Shader compile error:', glContext.getShaderInfoLog(shader));
        glContext.deleteShader(shader);
        return null;
    }
    return shader;
}

function createWebGLProgram(glContext, vertexShader, fragmentShader) {
    if (!vertexShader || !fragmentShader) return null;
    var program = glContext.createProgram();
    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);
    if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
        console.warn('Program link error:', glContext.getProgramInfoLog(program));
        glContext.deleteProgram(program);
        return null;
    }
    return program;
}

if (gl) {
    var vertexShader = createWebGLShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER_SOURCE);
    var fragmentShader = createWebGLShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER_SOURCE);
    var program = createWebGLProgram(gl, vertexShader, fragmentShader);

    if (program) {
        gl.useProgram(program);
        var positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var positionLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
        var timeLocation = gl.getUniformLocation(program, 'u_time');

        function resizeShader() {
            shaderCanvas.width = window.innerWidth;
            shaderCanvas.height = window.innerHeight;
            gl.viewport(0, 0, shaderCanvas.width, shaderCanvas.height);
            if (resolutionLocation) gl.uniform2f(resolutionLocation, shaderCanvas.width, shaderCanvas.height);
        }
        window.addEventListener('resize', resizeShader);
        resizeShader();

        function updateAppHeight() {
            var h = window.innerHeight;
            document.documentElement.style.setProperty('--app-height', h + 'px');
        }
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
            if (timeLocation) gl.uniform1f(timeLocation, (now - shaderStartTime) / 1000.0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            shaderAnimationFrame = requestAnimationFrame(renderShader);
        }

        function startShaderAnimation() {
            var themed = document.body && (document.body.classList.contains('theme-new-light') || document.body.classList.contains('theme-new-dark'));
            if (!shaderAnimationFrame && !window.__lowPowerMode && !themed) {
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
            var themed = document.body && (document.body.classList.contains('theme-new-light') || document.body.classList.contains('theme-new-dark'));
            if (!document.hidden && !window.__lowPowerMode && !themed) {
                startShaderAnimation();
            }
        });

        startShaderAnimation();

        window.__pauseShader = pauseShader;
        window.__resumeShader = resumeShader;
    }
}
