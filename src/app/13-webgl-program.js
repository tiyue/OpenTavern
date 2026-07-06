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
