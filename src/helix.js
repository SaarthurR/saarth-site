// Vanilla port of 21st.dev's dither-helix-carousel: a spiral column of photos
// that breaks up into print grain as it moves away from the viewer.
// WebGL2 pipeline: cards -> colour + meta targets -> four vertical blurs -> composite.
// Changes from the original: no React, no wheel capture (it would trap page
// scroll), touch swipes sideways so the page still scrolls, the loop pauses
// off-screen, clicking the front card calls onOpen, and every card keeps its
// photo's own aspect ratio instead of one cropped shape.

const CARD_H = 1.6;
const RADIUS = 3.8;
const RADIUS_STEP = 0.055;
const CAMERA_Z = 10;
const FOV = 22; // narrower than the original 48 so cards read big inside a page section
const NEAR = 0.1;
const FAR = 60;

const DRAG = 0.007;
const EASE = 0.075;
const SNAP_IDLE = 300;
const SNAP_EASE = 0.055;
const CLICK_SLOP = 6;

const BEND = 2.7;
const BEND_EASE = 0.12;
const BEND_MAX = 0.07;

const HOVER_IN = 0.095;
const HOVER_OUT = 0.07;
const HOVER_SETTLE = 8;
const FOCUS_FALLOFF = 0.7;

const ENTRY_MS = 1050;
const ENTRY_STAGGER_MS = 60;
const ENTRY_SPIN = 9.4;
const ENTRY_SPIN_MS = 2400;

const CLICK_MS = 1300;
const THEME_EVERY = 20;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const BAYER = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
#define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
#define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))
`;

const CARD_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
uniform float uIndex;
uniform float uProgress;
uniform float uCount;
uniform float uAngleStep;
uniform float uPitch;
uniform float uVelocity;
uniform vec2  uCard;
uniform float uFocal;
uniform float uAspect;
out vec2 vUv;
out float vDepth;
const float RADIUS = ${RADIUS.toFixed(3)};
const float RADIUS_STEP = ${RADIUS_STEP.toFixed(4)};
const float CAMERA_Z = ${CAMERA_Z.toFixed(1)};
const float NEAR = ${NEAR.toFixed(2)};
const float FAR = ${FAR.toFixed(1)};
const float BEND = ${BEND.toFixed(2)};
void main() {
  vUv = vec2(aPos.x, 1.0 - aPos.y);
  vec2 local = (aPos - 0.5) * uCard;
  float slot = mod(uIndex - uProgress, uCount) - floor(uCount * 0.5);
  float baseAngle = slot * uAngleStep;
  float baseY = slot * uPitch;
  float ty = (aPos.y - 0.5) * 2.0;
  baseAngle += uVelocity * BEND * ty * ty * uAngleStep * 0.5;
  float r = RADIUS + slot * RADIUS_STEP;
  float theta = baseAngle + local.x / r;
  vec3 p = vec3(sin(theta) * r, local.y + baseY, cos(theta) * r);
  float vz = p.z - CAMERA_Z;
  vDepth = -vz;
  gl_Position = vec4(
    p.x * uFocal / uAspect,
    p.y * uFocal,
    ((FAR + NEAR) * vz + 2.0 * FAR * NEAR) / (NEAR - FAR),
    -vz
  );
}`;

const CARD_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in float vDepth;
uniform sampler2D uMap;
uniform vec2 uImageRatio;
uniform vec3 uBackground;
uniform float uHover;
uniform float uDim;
uniform float uEntry;
uniform float uEntryScale;
uniform float uEntryAspect;
layout(location = 0) out vec4 outScene;
layout(location = 1) out vec4 outMeta;
const float FOG_NEAR = 8.0;
const float FOG_FAR = 20.6;
const float DIM_FADE = 0.67;
const float ENTRY_SOFTNESS = 0.45;
${BAYER}
bool notArrived(vec2 uv) {
  if (uEntry <= 0.0) return false;
  vec2 offset = (uv - 0.5) * vec2(uEntryAspect, 1.0);
  float d = length(offset) / length(vec2(uEntryAspect, 1.0) * 0.5);
  float front = (1.0 - uEntry) * (1.0 + ENTRY_SOFTNESS);
  return (front - d) / ENTRY_SOFTNESS <= bayer8(gl_FragCoord.xy / uEntryScale);
}
void main() {
  if (notArrived(vUv)) discard;
  vec2 uv = (vUv - 0.5) * uImageRatio + 0.5;
  vec3 color = texture(uMap, uv).rgb;
  float fog = smoothstep(FOG_NEAR, FOG_FAR, vDepth) * (1.0 - uHover);
  color = mix(color, uBackground, fog);
  color = mix(color, uBackground, 1.0 - pow(1.0 - uDim * DIM_FADE, 2.2));
  outScene = vec4(color, 1.0 - fog);
  outMeta = vec4(1.0, uDim, uHover, 1.0 - uEntry); // r = a card covers this pixel
}`;

const QUAD_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uMap;
uniform vec2 uTexel;
uniform float uSpread;
out vec4 fragColor;
void main() {
  vec2 stride = vec2(0.0, uTexel.y) * uSpread;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 18.0);
    sum += texture(uMap, vUv + stride * fi) * w;
    total += w;
  }
  fragColor = sum / total;
}`;

const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uMeta;
uniform sampler2D uBlur1;
uniform sampler2D uBlur2;
uniform sampler2D uBlur3;
uniform sampler2D uBlur4;
uniform vec2  uResolution;
uniform vec3  uBackground;
uniform vec3  uAccent;
uniform float uFocusSize;
uniform float uDitherScale;
uniform float uEntryScale;
out vec4 fragColor;
const float EDGE_POWER = 1.65;
const float BLUR_STRENGTH = 0.47;
const float FADE_STRENGTH = 0.4;
const float DITHER_AMOUNT = 0.77;
const float DITHER_START = 0.64;
const float DITHER_POWER = 1.25;
const float LEVELS = 8.0;
const float GAMMA = 1.8;
const float MONO = 0.22;
const float STAGING = 0.55;
const float SMEAR_END = 0.55;
const float GRAIN_BEGIN = 0.45;
const float YIELD = 0.75;
const float HOVER_BLUR = 0.13;
const float HOVER_DITHER = 0.3;
const float HOVER_CURVE = 1.9;
const float HOVER_LEVELS = 8.0;
const float HOVER_CUTOFF = 0.22;
const float HOVER_GAMMA = 1.8;
const float ENTRY_DITHER = 0.45;
const float ENTRY_LEVELS = 4.0;
const float ENTRY_GAMMA = 1.5;
${BAYER}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 blurStack(vec2 uv, float lvl) {
  vec3 c = texture(uScene, uv).rgb;
  c = mix(c, texture(uBlur1, uv).rgb, clamp(lvl - 0.0, 0.0, 1.0));
  c = mix(c, texture(uBlur2, uv).rgb, clamp(lvl - 1.0, 0.0, 1.0));
  c = mix(c, texture(uBlur3, uv).rgb, clamp(lvl - 2.0, 0.0, 1.0));
  c = mix(c, texture(uBlur4, uv).rgb, clamp(lvl - 3.0, 0.0, 1.0));
  return c;
}
vec3 towardPage(vec3 c, float fade) { return mix(c, uBackground, fade); }
vec2 latticeUv(float cell) {
  return (floor(gl_FragCoord.xy / cell) + 0.5) * cell / uResolution;
}
vec3 toneScale(float t) {
  return t < 0.5
    ? mix(uBackground, uAccent, t * 2.0)
    : mix(uAccent, uBackground, (t - 0.5) * 2.0);
}
vec3 quantise(vec3 c, float threshold, float levels, float gamma) {
  float steps = max(levels - 1.0, 1.0);
  vec3 toned = toneScale(floor(pow(clamp(luma(c), 0.0, 1.0), gamma) * steps + threshold) / steps);
  vec3 quantized = floor(c * steps + threshold) / steps;
  return mix(quantized, toned, MONO);
}
void main() {
  float d = abs(vUv.y - 0.5) * 2.0;
  float edge = pow(smoothstep(uFocusSize, 1.0, d), EDGE_POWER);
  vec4 scene = texture(uScene, vUv);
  vec4 meta = texture(uMeta, vUv);
  float dim = meta.g;
  float entry = 1.0 - meta.a;
  float keep = 1.0 - meta.b;
  float distance = 1.0 - scene.a;
  float dissolve = max(edge, distance);
  float grainFree = pow(smoothstep(DITHER_START, 1.0, max(d, distance)), DITHER_POWER);
  float grainStaged = pow(smoothstep(GRAIN_BEGIN, 1.0, dissolve), DITHER_POWER);
  float smearStaged = smoothstep(0.0, SMEAR_END, dissolve) * (1.0 - grainStaged * YIELD);
  float blurDrive = mix(dissolve, smearStaged, STAGING);
  float ditherDrive = mix(grainFree, grainStaged, STAGING);
  float softness = max(blurDrive, dim * HOVER_BLUR) * keep;
  float lvl = softness * BLUR_STRENGTH * 4.0;
  float fade = edge * FADE_STRENGTH * keep;
  vec3 c = towardPage(blurStack(vUv, lvl), fade);
  float threshold = bayer8(gl_FragCoord.xy / uDitherScale);
  vec3 source = uDitherScale > 1.0
    ? towardPage(blurStack(latticeUv(uDitherScale), lvl), fade)
    : c;
  vec3 result = mix(c, quantise(source, threshold, LEVELS, GAMMA), DITHER_AMOUNT * ditherDrive * keep);
  float hoverRamp = smoothstep(HOVER_CUTOFF, 1.0, pow(dim, HOVER_CURVE)) * HOVER_DITHER;
  float hoverThreshold = bayer8(gl_FragCoord.xy / (uDitherScale * 1.35));
  vec3 hoverSource = towardPage(blurStack(latticeUv(uDitherScale * 1.35), lvl), fade);
  result = mix(result, quantise(hoverSource, hoverThreshold, HOVER_LEVELS, HOVER_GAMMA), hoverRamp);
  float entryThreshold = bayer8(gl_FragCoord.xy / uEntryScale);
  vec3 entrySource = towardPage(blurStack(latticeUv(uEntryScale), lvl), fade);
  result = mix(result, quantise(entrySource, entryThreshold, ENTRY_LEVELS, ENTRY_GAMMA), entry * ENTRY_DITHER);
  // see-through wherever the result is just page colour, so whatever sits
  // behind the canvas (the orb) shows; output is premultiplied
  result = clamp(result, 0.0, 1.0);
  vec3 off = abs(result - uBackground);
  // faint grain on empty page stays transparent instead of a dotted band
  float a = max(meta.r, clamp((max(off.r, max(off.g, off.b)) - 0.04) * 10.0, 0.0, 1.0));
  fragColor = vec4(max(result - uBackground * (1.0 - a), 0.0), a);
}`;

function build(gl, vert, frag) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function uniforms(gl, program) {
  const cache = new Map();
  return (name) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
    return cache.get(name);
  };
}

// asks the browser to resolve any CSS colour instead of parsing it
function colorReader() {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  return (css) => {
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  };
}

function texture(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Returns { step(by), turn(by) } or null when WebGL2 is missing. */
export function createHelix(canvas, images, {
  cell = 7.5, focusBand = 0.25, twist = 0.8, rise = 0.79,
  reduced = false, onActive = () => {}, onOpen = () => {},
} = {}) {
  const count = images.length;
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false });
  if (!gl || !count) return null;

  const readColor = colorReader();
  const cardProgram = build(gl, CARD_VERT, CARD_FRAG);
  const blurProgram = build(gl, QUAD_VERT, BLUR_FRAG);
  const compositeProgram = build(gl, QUAD_VERT, COMPOSITE_FRAG);
  if (!cardProgram || !blurProgram || !compositeProgram) return null;
  const cardU = uniforms(gl, cardProgram);
  const blurU = uniforms(gl, blurProgram);
  const compositeU = uniforms(gl, compositeProgram);

  // tessellated so the bend reads as a curve, not a fold
  const COLS = 40;
  const ROWS = 8;
  const verts = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const x0 = x / COLS, x1 = (x + 1) / COLS, y0 = y / ROWS, y1 = (y + 1) / ROWS;
      verts.push(x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1);
    }
  }
  const cardMesh = gl.createVertexArray();
  gl.bindVertexArray(cardMesh);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const cardVertexCount = verts.length / 2;

  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const sceneFbo = gl.createFramebuffer();
  let sceneTex = texture(gl, 1, 1);
  let metaTex = texture(gl, 1, 1);
  const depth = gl.createRenderbuffer();
  const blurFbos = [0, 1, 2, 3].map(() => gl.createFramebuffer());
  let blurTex = [0, 1, 2, 3].map(() => texture(gl, 1, 1));

  const attach = (w, h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.deleteTexture(sceneTex);
    gl.deleteTexture(metaTex);
    sceneTex = texture(gl, w, h);
    metaTex = texture(gl, w, h);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, metaTex, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    blurTex.forEach((tex) => gl.deleteTexture(tex));
    blurTex = blurFbos.map((fbo, i) => {
      const tex = texture(gl, Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return tex;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const cards = images.map(() => ({ texture: null, aspect: 1.5 }));
  images.forEach((src, i) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      cards[i].texture = tex;
      cards[i].aspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
    };
    image.src = src;
  });

  let width = 0, height = 0;
  let progress = 0, goal = 0, smoothed = 0, lastInput = 0, snapped = true;
  let hovered = -1, pointerX = -1, pointerY = -1, pointerSpeed = 0;
  let ticks = 0, frame = 0, entryStart = 0, active = -1;
  let background = [0, 0, 0];
  let accentRgb = [1, 1, 1];
  let tween = null;

  const dim = new Float32Array(count);
  const hover = new Float32Array(count);
  const entryOf = new Float32Array(count).fill(reduced ? 0 : 1);
  const order = images.map((_, i) => i).sort(() => Math.random() - 0.5);
  const focal = 1 / Math.tan((FOV * Math.PI) / 360);
  const FRONT = Math.floor(count / 2);
  progress = goal = count - FRONT; // so photo 1 faces the camera first

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = w;
    height = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    attach(canvas.width, canvas.height);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // columnar layout, so projected bounds are enough for hit-testing
  const project = (index) => {
    const slot = ((((index - progress) % count) + count) % count) - FRONT;
    const angle = slot * twist;
    const y = slot * rise * CARD_H;
    const z = Math.cos(angle) * (RADIUS + slot * RADIUS_STEP);
    const away = CAMERA_Z - z;
    if (away <= NEAR) return null;
    const aspect = width / Math.max(height, 1);
    const sx = ((Math.sin(angle) * (RADIUS + slot * RADIUS_STEP) * focal) / aspect / away) * 0.5 + 0.5;
    const sy = 0.5 - ((y * focal) / away) * 0.5;
    return {
      x: sx * width,
      y: sy * height,
      halfW: ((CARD_H * cards[index].aspect * focal) / aspect / away) * 0.5 * width * 0.5,
      halfH: ((CARD_H * focal) / away) * 0.5 * height * 0.5,
      away,
    };
  };
  const pick = (px, py) => {
    let best = -1, bestAway = Infinity;
    for (let i = 0; i < count; i++) {
      const at = project(i);
      if (!at || Math.abs(px - at.x) > at.halfW || Math.abs(py - at.y) > at.halfH) continue;
      if (at.away < bestAway) { bestAway = at.away; best = i; }
    }
    return best;
  };

  const step = (by) => {
    tween = { from: goal, to: Math.round(goal) + by, at: performance.now() };
    lastInput = performance.now();
    snapped = true;
  };

  // mouse drags vertically like the original; touch drags sideways so a
  // vertical swipe still scrolls the page (canvas has touch-action: pan-y)
  let dragFrom = null, dragTravel = 0, dragTouch = false;
  canvas.addEventListener("pointerdown", (e) => {
    dragTouch = e.pointerType !== "mouse";
    dragFrom = dragTouch ? e.clientX : e.clientY;
    dragTravel = 0;
    tween = null;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const box = canvas.getBoundingClientRect();
    const nx = e.clientX - box.left;
    const ny = e.clientY - box.top;
    pointerSpeed = Math.hypot(nx - pointerX, ny - pointerY);
    pointerX = nx;
    pointerY = ny;
    if (dragFrom !== null) {
      const at = dragTouch ? e.clientX : e.clientY;
      const travel = dragFrom - at;
      dragTravel += Math.abs(travel);
      dragFrom = at;
      goal += travel * DRAG;
      lastInput = performance.now();
      snapped = false;
    }
  });
  const onUp = () => {
    const wasClick = dragFrom !== null && dragTravel < CLICK_SLOP;
    dragFrom = null;
    if (!wasClick) return;
    const hit = pick(pointerX, pointerY);
    if (hit < 0) return;
    if (hit === active) return onOpen(hit); // front card: show it whole
    const want = (((hit - FRONT) % count) + count) % count;
    const to = want + Math.round((goal - want) / count) * count;
    tween = { from: goal, to, at: performance.now() };
    snapped = true;
  };
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", () => { dragFrom = null; });
  canvas.addEventListener("pointerleave", () => { pointerX = pointerY = -1; hovered = -1; });

  const drawQuad = () => {
    gl.bindVertexArray(quad);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const draw = (now) => {
    frame = requestAnimationFrame(draw);
    if (!width || !height) return;

    if (ticks++ % THEME_EVERY === 0) {
      background = readColor(getComputedStyle(document.body).backgroundColor);
      accentRgb = readColor(getComputedStyle(canvas).color);
    }

    const ready = cards.every((card) => card.texture);
    if (ready && !entryStart) entryStart = now;
    const elapsed = entryStart ? now - entryStart : 0;
    if (ready && !reduced) {
      for (let rank = 0; rank < count; rank++) {
        entryOf[order[rank]] = 1 - clamp((elapsed - rank * ENTRY_STAGGER_MS) / ENTRY_MS, 0, 1);
      }
      progress = goal - ENTRY_SPIN * (1 - inOutCubic(clamp(elapsed / ENTRY_SPIN_MS, 0, 1)));
    } else if (ready) {
      entryOf.fill(0);
    }
    const arriving = !reduced && ready && elapsed < ENTRY_SPIN_MS;

    if (tween) {
      const t = clamp((now - tween.at) / CLICK_MS, 0, 1);
      goal = tween.from + (tween.to - tween.from) * inOutCubic(t);
      if (t >= 1) tween = null;
    } else if (!snapped && now - lastInput > SNAP_IDLE) {
      snapped = true;
    }

    // settle on the nearest card without rewriting goal, so page-scroll
    // nudges keep their fractions and a full scroll reaches the last photo
    const target = snapped ? Math.round(goal) : goal;
    const before = progress;
    if (!arriving) progress += (target - progress) * (reduced ? 1 : snapped ? SNAP_EASE : EASE);
    smoothed += (clamp(progress - before, -BEND_MAX, BEND_MAX) - smoothed) * BEND_EASE;

    const near = (((Math.round(goal) + FRONT) % count) + count) % count;
    if (near !== active) onActive((active = near));

    if (pointerX >= 0 && pointerSpeed < HOVER_SETTLE) hovered = pick(pointerX, pointerY);
    pointerSpeed *= 0.8;
    for (let i = 0; i < count; i++) {
      const wantHover = i === hovered ? 1 : 0;
      hover[i] += (wantHover - hover[i]) * (wantHover > hover[i] ? HOVER_IN : HOVER_OUT);
      let wantDim = 0;
      if (hovered >= 0) {
        let gap = Math.abs(i - hovered);
        gap = Math.min(gap, count - gap);
        wantDim = clamp(gap / FOCUS_FALLOFF, 0, 1);
      }
      dim[i] += (wantDim - dim[i]) * (wantDim > dim[i] ? HOVER_IN : HOVER_OUT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.clearBufferfv(gl.COLOR, 0, [background[0], background[1], background[2], 1]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(cardProgram);
    gl.bindVertexArray(cardMesh);
    gl.uniform1f(cardU("uCount"), count);
    gl.uniform1f(cardU("uProgress"), progress);
    gl.uniform1f(cardU("uAngleStep"), twist);
    gl.uniform1f(cardU("uPitch"), rise * CARD_H);
    gl.uniform1f(cardU("uVelocity"), smoothed);
    gl.uniform1f(cardU("uFocal"), focal);
    gl.uniform1f(cardU("uAspect"), width / height);
    gl.uniform3fv(cardU("uBackground"), background);
    gl.uniform1i(cardU("uMap"), 0);
    gl.uniform1f(cardU("uEntryScale"), 9.5);
    gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < count; i++) {
      const card = cards[i];
      if (!card.texture) continue;
      gl.bindTexture(gl.TEXTURE_2D, card.texture);
      gl.uniform1f(cardU("uIndex"), i);
      gl.uniform1f(cardU("uHover"), hover[i]);
      gl.uniform1f(cardU("uDim"), dim[i]);
      gl.uniform1f(cardU("uEntry"), entryOf[i]);
      // each card takes its photo's own shape, so nothing is cropped
      gl.uniform2f(cardU("uCard"), CARD_H * card.aspect, CARD_H);
      gl.uniform1f(cardU("uEntryAspect"), card.aspect);
      gl.uniform2f(cardU("uImageRatio"), 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, cardVertexCount);
    }
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(blurProgram);
    gl.uniform1i(blurU("uMap"), 0);
    gl.uniform1f(blurU("uSpread"), 4.5);
    let source = sceneTex;
    for (let i = 0; i < 4; i++) {
      const w = Math.max(1, canvas.width >> (i + 1));
      const h = Math.max(1, canvas.height >> (i + 1));
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurFbos[i]);
      gl.viewport(0, 0, w, h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform2f(blurU("uTexel"), 1 / w, 1 / h);
      drawQuad();
      source = blurTex[i];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProgram);
    const names = ["uScene", "uMeta", "uBlur1", "uBlur2", "uBlur3", "uBlur4"];
    [sceneTex, metaTex, ...blurTex].forEach((tex, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(compositeU(names[unit]), unit);
    });
    gl.uniform2f(compositeU("uResolution"), canvas.width, canvas.height);
    gl.uniform3fv(compositeU("uBackground"), background);
    gl.uniform3fv(compositeU("uAccent"), accentRgb);
    gl.uniform1f(compositeU("uFocusSize"), focusBand);
    gl.uniform1f(compositeU("uDitherScale"), cell);
    gl.uniform1f(compositeU("uEntryScale"), 9.5);
    drawQuad();
    gl.activeTexture(gl.TEXTURE0);
  };

  // only render while on screen; the entry animation starts on first view
  new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(frame);
    if (entry.isIntersecting) frame = requestAnimationFrame(draw);
  }).observe(canvas);

  // relative nudge from outside input (page scroll); drag still adds on top
  const turn = (by) => {
    tween = null;
    goal += by;
    lastInput = performance.now();
    snapped = false;
  };

  return { step, turn };
}
