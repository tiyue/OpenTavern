/**
 * 新手导读（文件：13-webgl-program.js）
 *
 * 负责什么：这是“WebGL 动态背景”中的“WebGL 背景、绘图程序”部分。
 * 在程序中的位置：它初始化绘图程序，并根据窗口大小和主题持续刷新背景。
 * 从哪里开始看：主要从 `createWebGLShader(glContext, type, source)`、`createWebGLProgram(glContext, vertexShader, fragmentShader)`、`setupWebGLFullscreenQuad(glContext, program)`、`getWebGLBackgroundUniforms(glContext, program)` 开始阅读。参数名能提示每个函数需要的数据。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：着色器代码运行在 GPU 上；语法错误可能只表现为背景消失。
 */
// ==================== WebGL Program Helpers ====================
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

function setupWebGLFullscreenQuad(glContext, program) {
    var positionBuffer = glContext.createBuffer();
    glContext.bindBuffer(glContext.ARRAY_BUFFER, positionBuffer);
    glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), glContext.STATIC_DRAW);
    var positionLocation = glContext.getAttribLocation(program, 'a_position');
    glContext.enableVertexAttribArray(positionLocation);
    glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);
}

function getWebGLBackgroundUniforms(glContext, program) {
    return {
        resolution: glContext.getUniformLocation(program, 'u_resolution'),
        time: glContext.getUniformLocation(program, 'u_time')
    };
}
