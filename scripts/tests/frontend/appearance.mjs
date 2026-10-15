import { assert } from '../support.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';


async function assertFrontendWebGLBackgroundHelpers() {
  const sources = await Promise.all([
    '../../../src/app/appearance/13-webgl-program.js',
    '../../../src/app/appearance/13-webgl-layout.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));

  function classList(initial = []) {
    const values = new Set(initial);
    return {
      values,
      add(name) { values.add(name); },
      remove(name) { values.delete(name); },
      contains(name) { return values.has(name); },
    };
  }

  const warnings = [];
  const events = [];
  const context = {
    console: { warn: (...args) => warnings.push(args.join(' ')) },
    window: { innerWidth: 640, innerHeight: 480 },
    document: {
      documentElement: {
        style: {
          setProperty(name, value) {
            events.push(`style:${name}:${value}`);
          },
        },
      },
      body: { classList: classList() },
    },
    Float32Array,
    Set,
  };

  vm.runInNewContext(`${sources.join('\n')}\nthis.__shader = createWebGLShader;\nthis.__program = createWebGLProgram;\nthis.__quad = setupWebGLFullscreenQuad;\nthis.__uniforms = getWebGLBackgroundUniforms;\nthis.__resize = resizeShaderCanvas;\nthis.__height = updateAppHeight;\nthis.__paused = isShaderPausedByTheme;`, context);

  function createFakeGl(options = {}) {
    const calls = [];
    return {
      calls,
      VERTEX_SHADER: 'vertex',
      FRAGMENT_SHADER: 'fragment',
      COMPILE_STATUS: 'compile',
      LINK_STATUS: 'link',
      ARRAY_BUFFER: 'array-buffer',
      STATIC_DRAW: 'static-draw',
      FLOAT: 'float',
      TRIANGLE_STRIP: 'strip',
      createShader(type) { calls.push('createShader:' + type); return { type }; },
      shaderSource(shader, source) { shader.source = source; },
      compileShader(shader) { shader.compiled = true; },
      getShaderParameter() { return options.shaderOk !== false; },
      getShaderInfoLog() { return 'shader failed'; },
      deleteShader(shader) { calls.push('deleteShader:' + shader.type); },
      createProgram() { calls.push('createProgram'); return { shaders: [] }; },
      attachShader(program, shader) { program.shaders.push(shader); },
      linkProgram(program) { program.linked = true; },
      getProgramParameter() { return options.programOk !== false; },
      getProgramInfoLog() { return 'program failed'; },
      deleteProgram() { calls.push('deleteProgram'); },
      createBuffer() { calls.push('createBuffer'); return {}; },
      bindBuffer(target) { calls.push('bindBuffer:' + target); },
      bufferData(target, data, usage) { calls.push(`bufferData:${target}:${data.length}:${usage}`); },
      getAttribLocation(_program, name) { calls.push('attrib:' + name); return 3; },
      enableVertexAttribArray(location) { calls.push('enable:' + location); },
      vertexAttribPointer(location, size, type) { calls.push(`pointer:${location}:${size}:${type}`); },
      getUniformLocation(_program, name) { return 'uniform:' + name; },
      viewport(x, y, w, h) { calls.push(`viewport:${x}:${y}:${w}:${h}`); },
      uniform2f(location, w, h) { calls.push(`uniform2f:${location}:${w}:${h}`); },
    };
  }

  const glOk = createFakeGl();
  const shader = context.__shader(glOk, glOk.VERTEX_SHADER, 'source');
  assert(shader && shader.source === 'source' && shader.compiled === true, 'WebGL shader helper should compile valid shaders.');

  const glBadShader = createFakeGl({ shaderOk: false });
  assert(context.__shader(glBadShader, glBadShader.FRAGMENT_SHADER, 'bad') === null, 'WebGL shader helper should return null on compile failure.');
  assert(glBadShader.calls.includes('deleteShader:fragment') && warnings.some((msg) => msg.includes('Shader compile error')), 'WebGL shader helper should delete failed shaders and warn.');

  const program = context.__program(glOk, { id: 'v' }, { id: 'f' });
  assert(program && program.linked === true && program.shaders.length === 2, 'WebGL program helper should link shaders.');

  const glBadProgram = createFakeGl({ programOk: false });
  assert(context.__program(glBadProgram, { id: 'v' }, { id: 'f' }) === null, 'WebGL program helper should return null on link failure.');
  assert(glBadProgram.calls.includes('deleteProgram'), 'WebGL program helper should delete failed programs.');

  context.__quad(glOk, program);
  assert(glOk.calls.includes('bufferData:array-buffer:8:static-draw'), 'WebGL quad helper should upload four fullscreen vertices.');
  const uniforms = context.__uniforms(glOk, program);
  assert(uniforms.resolution === 'uniform:u_resolution' && uniforms.time === 'uniform:u_time', 'WebGL uniform helper should resolve expected uniforms.');

  const canvas = {};
  context.__resize(canvas, glOk, uniforms.resolution);
  assert(canvas.width === 640 && canvas.height === 480, 'WebGL resize helper should sync canvas size.');
  assert(glOk.calls.includes('viewport:0:0:640:480') && glOk.calls.includes('uniform2f:uniform:u_resolution:640:480'), 'WebGL resize helper should update viewport and resolution uniform.');

  context.__height();
  assert(events.includes('style:--app-height:480px'), 'WebGL layout helper should update --app-height.');
  assert(context.__paused() === false, 'WebGL theme pause helper should allow classic theme.');
  context.document.body.classList.add('theme-new-light');
  assert(context.__paused() === true, 'WebGL theme pause helper should pause themed UI.');
}
export { assertFrontendWebGLBackgroundHelpers };
