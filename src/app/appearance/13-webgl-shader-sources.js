/**
 * 新手导读（文件：13-webgl-shader-sources.js）
 *
 * 负责什么：这是“WebGL 动态背景”中的“WebGL 背景、着色器、源码”部分。
 * 在程序中的位置：它初始化绘图程序，并根据窗口大小和主题持续刷新背景。
 * 从哪里开始看：本文件主要保存常量、配置或立即执行代码，没有独立的命名函数。
 * 代码如何生效：浏览器不会单独加载这个文件。scripts/build-app.js 会按照 manifest.json 的顺序，
 * 把它与其他分片合并成 assets/js/app.js；因此这里定义的函数可以被后面加载的分片调用。
 * 修改时注意：着色器代码运行在 GPU 上；语法错误可能只表现为背景消失。
 */
// ==================== WebGL Shader Sources ====================
var WEBGL_VERTEX_SHADER_SOURCE = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
].join('\n');

var WEBGL_FRAGMENT_SHADER_SOURCE = [
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

    '  float degree = noise(vec2(u_time*.1, tuv.x*tuv.y));',
    '  tuv.y *= 1./ratio;',
    '  tuv *= Rot(radians((degree-.5)*720.+180.));',
    '  tuv.y *= ratio;',

    '  float frequency = 5.;',
    '  float amplitude = 30.;',
    '  float speed = u_time * 2.;',
    '  tuv.x += sin(tuv.y*frequency+speed)/amplitude;',
    '  tuv.y += sin(tuv.x*frequency*1.5+speed)/(amplitude*.5);',

    '  vec3 colorYellow = vec3(0.18, 0.11, 0.06);',
    '  vec3 colorDeepBlue = vec3(0.09, 0.06, 0.04);',
    '  vec3 layer1 = mix(colorYellow, colorDeepBlue, S(-.3, .2, (tuv*Rot(radians(-5.))).x));',

    '  vec3 colorRed = vec3(0.22, 0.08, 0.05);',
    '  vec3 colorBlue = vec3(0.13, 0.09, 0.06);',
    '  vec3 layer2 = mix(colorRed, colorBlue, S(-.3, .2, (tuv*Rot(radians(-5.))).x));',

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
