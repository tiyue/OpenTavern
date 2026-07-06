// ==================== WebGL Background ====================
var shaderCanvas = document.getElementById('shaderCanvas');
var gl = shaderCanvas.getContext('webgl') || shaderCanvas.getContext('experimental-webgl');

if (gl) {
    var vertexShaderSource = [
        'attribute vec2 a_position;',
        'void main() {',
        '  gl_Position = vec4(a_position, 0.0, 1.0);',
        '}'
    ].join('\n');

    var fragmentShaderSource = [
        'precision mediump float;',

        '#define S(a,b,t) smoothstep(a,b,t)',

        'mat2 Rot(float a) {',
        '  float s = sin(a);',
        '  float c = cos(a);',
        '  return mat2(c, -s, s, c);',
        '}',

        'vec2 hash(vec2 p) {',
        '  p = vec2(dot(p,vec2(2127.1,81.17)), dot(p,vec2(1269.5,283.37)));',
        '  return fract(sin(p)*43758.5453);',
        '}',

        'float noise(in vec2 p) {',
        '  vec2 i = floor(p);',
        '  vec2 f = fract(p);',
        '  vec2 u = f*f*(3.0-2.0*f);',
        '  float n = mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),',
        '                     dot(-1.0+2.0*hash(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),',
        '               mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),',
        '                     dot(-1.0+2.0*hash(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);',
        '  return 0.5 + 0.5*n;',
        '}',

        'uniform vec2 u_resolution;',
        'uniform float u_time;',

        'void mainImage(out vec4 fragColor, in vec2 fragCoord) {',
        '  vec2 uv = fragCoord/u_resolution.xy;',
        '  float ratio = u_resolution.x / u_resolution.y;',

        '  vec2 tuv = uv;',
        '  tuv -= .5;',

        // Rotation driven by noise
        '  float degree = noise(vec2(u_time*.1, tuv.x*tuv.y));',
        '  tuv.y *= 1./ratio;',
        '  tuv *= Rot(radians((degree-.5)*720.+180.));',
        '  tuv.y *= ratio;',

        // Sine wave warp
        '  float frequency = 5.;',
        '  float amplitude = 30.;',
        '  float speed = u_time * 2.;',
        '  tuv.x += sin(tuv.y*frequency+speed)/amplitude;',
        '  tuv.y += sin(tuv.x*frequency*1.5+speed)/(amplitude*.5);',

        // Layer 1: warm cream → deep blue
        '  vec3 colorYellow = vec3(0.18, 0.11, 0.06);',
        '  vec3 colorDeepBlue = vec3(0.09, 0.06, 0.04);',
        '  vec3 layer1 = mix(colorYellow, colorDeepBlue, S(-.3, .2, (tuv*Rot(radians(-5.))).x));',

        // Layer 2: pink → sky blue
        '  vec3 colorRed = vec3(0.22, 0.08, 0.05);',
        '  vec3 colorBlue = vec3(0.13, 0.09, 0.06);',
        '  vec3 layer2 = mix(colorRed, colorBlue, S(-.3, .2, (tuv*Rot(radians(-5.))).x));',

        // Blend layers vertically
        '  vec3 finalComp = mix(layer1, layer2, S(.5, -.3, tuv.y));',

        '  fragColor = vec4(finalComp, 1.0);',
        '}',

        'void main() {',
        '  vec2 fragCoord = gl_FragCoord.xy;',
        '  vec4 color;',
        '  mainImage(color, fragCoord);',
        '  gl_FragColor = color;',
        '}'
    ].join('\n');

    function createShader(gl, type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    var program = (function() {
        if (!vertexShader || !fragmentShader) return null;
        var p = gl.createProgram();
        gl.attachShader(p, vertexShader);
        gl.attachShader(p, fragmentShader);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.warn('Program link error:', gl.getProgramInfoLog(p));
            gl.deleteProgram(p);
            return null;
        }
        return p;
    })();

    if (program) {
        gl.useProgram(program);
        var positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
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

        // Mobile / Tablet full-height fix: use dynamic viewport + safe area
        function updateAppHeight() {
            // Prefer dvh if supported, fallback to innerHeight for older browsers / keyboard issues
            var h = window.innerHeight;
            document.documentElement.style.setProperty('--app-height', h + 'px');
        }
        window.addEventListener('resize', updateAppHeight);
        window.addEventListener('orientationchange', updateAppHeight);
        // Also update on load
        setTimeout(updateAppHeight, 0);

        var shaderStartTime = performance.now();
        var shaderAnimationFrame = null;

        function renderShader(now) {
            if (document.hidden) {
                // 页面不可见时节流，停止绘制
                shaderAnimationFrame = null;
                return;
            }
            // 效能模式下额外保护（applyPerformanceMode 会负责暂停）
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

        // 效能模式专用：暂停着色器（取消 RAF + 隐藏 canvas，彻底释放 GPU）
        function pauseShader() {
            window.__lowPowerMode = true;
            if (shaderAnimationFrame) {
                cancelAnimationFrame(shaderAnimationFrame);
                shaderAnimationFrame = null;
            }
            if (shaderCanvas) shaderCanvas.style.display = 'none';
        }

        // 恢复着色器（显示 canvas 并重启 RAF）
        function resumeShader() {
            window.__lowPowerMode = false;
            if (shaderCanvas) shaderCanvas.style.display = '';
            if (gl && !shaderAnimationFrame) {
                startShaderAnimation();
            }
        }

        // 页面可见性变化时控制动画（低功耗时不恢复）
        document.addEventListener('visibilitychange', function() {
            var themed = document.body && (document.body.classList.contains('theme-new-light') || document.body.classList.contains('theme-new-dark'));
            if (!document.hidden && !window.__lowPowerMode && !themed) {
                startShaderAnimation();
            }
        });

        // 初始启动：新版工作区主题不需要经典玻璃 shader。
        startShaderAnimation();

        // 暴露控制函数供 applyPerformanceMode 调用
        window.__pauseShader = pauseShader;
        window.__resumeShader = resumeShader;
    }
}

// ==================== 效能模式应用函数（供设置开关与启动时调用） ====================
function applyPerformanceMode(enabled) {
    var isLow = !!enabled;
    // 1. body 类控制 CSS 规则（blur、shader display、动画等）
    if (document.body) {
        document.body.classList.toggle('low-power', isLow);
    }
    // 2. 着色器控制（使用 shader 块暴露的函数）
    try {
        if (isLow) {
            if (typeof window.__pauseShader === 'function') window.__pauseShader();
        } else if (!document.body || (!document.body.classList.contains('theme-new-light') && !document.body.classList.contains('theme-new-dark'))) {
            if (typeof window.__resumeShader === 'function') window.__resumeShader();
        }
    } catch (e) {
        // 静默失败（shader 可能尚未就绪，启动时 apply 会再试）
    }
    // 未来可在此添加更多节流（如限制流式渲染频率等）
}

// ==================== 界面主题应用函数（独立于效能模式） ====================
function applyUiTheme(theme) {
    var value = typeof normalizeUiTheme === 'function' ? normalizeUiTheme(theme) : (theme || 'new-light');
    if (typeof cacheUiTheme === 'function') cacheUiTheme(value);
    if (!document.body) return;
    document.body.classList.remove('theme-new-light', 'theme-new-dark');
    if (value !== 'classic') {
        document.body.classList.add('theme-' + value);
        try { if (typeof window.__pauseShader === 'function') window.__pauseShader(); } catch (e) {}
    } else if (!document.body.classList.contains('low-power')) {
        try { if (typeof window.__resumeShader === 'function') window.__resumeShader(); } catch (e) {}
    }
}
