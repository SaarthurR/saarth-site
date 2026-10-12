import * as THREE from "three";
import { buildShapes } from "./shapes.js";

// Particle system that morphs between per-section shapes.
// Two shape buffers (A/B) hold the current adjacent pair; uMorph blends them.
export function createScene(canvas, { reducedMotion }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.z = 4.2;

  const COUNT = 14000;
  const slots = buildShapes(COUNT);

  const randoms = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) randoms[i] = Math.random();

  const shapeA = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3);
  const shapeB = new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3);
  shapeA.setUsage(THREE.DynamicDrawUsage);
  shapeB.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.BufferGeometry();
  // position attr is required by three but unused in the shader path; reuse shape A data
  geometry.setAttribute("position", shapeA);
  geometry.setAttribute("aShapeA", shapeA);
  geometry.setAttribute("aShapeB", shapeB);
  geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 99) },
    uPulse: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMorph: { value: 0 },
    uTypeA: { value: slots[0].type },
    uTypeB: { value: slots[1].type },
    uScaleA: { value: slots[0].scale ?? 1 },
    uScaleB: { value: slots[1].scale ?? 1 },
    uDimA: { value: slots[0].dim },
    uDimB: { value: slots[1].dim },
    uOffsetA: { value: new THREE.Vector3() },
    uOffsetB: { value: new THREE.Vector3() },
    uTintA: { value: new THREE.Color().setRGB(...slots[0].tint) },
    uTintB: { value: new THREE.Color().setRGB(...slots[1].tint) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMouse;
      uniform float uPulse;
      uniform float uPixelRatio;
      uniform float uMorph;
      uniform float uTypeA;
      uniform float uTypeB;
      uniform float uScaleA;
      uniform float uScaleB;
      uniform float uDimA;
      uniform float uDimB;
      uniform vec3 uOffsetA;
      uniform vec3 uOffsetB;
      attribute vec3 aShapeA;
      attribute vec3 aShapeB;
      attribute float aRandom;
      varying float vAlpha;
      varying float vHeat;

      vec3 animate(vec3 p, float type, float rnd) {
        if (type < 0.5) {
          // gentle sway
          p.x += sin(uTime * 0.4 + rnd * 6.2831) * 0.05;
          p.y += cos(uTime * 0.3 + rnd * 12.566) * 0.05;
        } else if (type < 1.5) {
          // breathing (orb)
          p += normalize(p) * sin(uTime * 0.6 + rnd * 6.2831) * 0.05;
        } else if (type < 2.5) {
          // traveling wave + interference ripple (physics)
          p.y += sin(p.x * 2.2 - uTime * 1.6) * 0.3
               + sin(p.x * 5.0 + p.z * 2.0 + uTime * 2.3) * 0.09;
        } else if (type < 3.5) {
          // slow spin around own axis (network)
          float a = uTime * 0.25;
          float c = cos(a), s = sin(a);
          p.xz = mat2(c, -s, s, c) * p.xz;
        } else {
          // tumble (knot)
          float a = uTime * 0.22;
          float c = cos(a), s = sin(a);
          p.xz = mat2(c, -s, s, c) * p.xz;
          p.yz = mat2(c, s, -s, c) * p.yz;
        }
        // tabla pulse: radial shockwave from the shape's own center
        p += normalize(p + 0.0001) * uPulse * (0.25 + rnd * 0.35);
        return p;
      }

      void main() {
        vec3 a = animate(aShapeA * uScaleA, uTypeA, aRandom) + uOffsetA;
        vec3 b = animate(aShapeB * uScaleB, uTypeB, aRandom) + uOffsetB;

        // particles travel at slightly different speeds for a dissolve feel
        float m = clamp(uMorph + (aRandom - 0.5) * 0.25, 0.0, 1.0);
        m = m * m * (3.0 - 2.0 * m);
        vec3 pos = mix(a, b, m);

        // mouse repulsion
        vec3 toMouse = pos - uMouse;
        float d = length(toMouse);
        float force = smoothstep(1.1, 0.0, d);
        pos += normalize(toMouse + 0.0001) * force * 0.55;
        vHeat = force;

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);

        // fisheye lens distortion: bulge points near screen center
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        float rad = length(ndc);
        float fish = 1.0 + 0.3 * (1.0 - rad * rad);
        clip.xy *= fish;

        gl_Position = clip;
        gl_PointSize = (1.4 + aRandom * 2.2 + force * 3.0) * uPixelRatio * (3.4 / -mv.z);

        float dim = mix(uDimA, uDimB, uMorph);
        vAlpha = (0.35 + aRandom * 0.4) * dim;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMorph;
      uniform vec3 uTintA;
      uniform vec3 uTintB;
      varying float vAlpha;
      varying float vHeat;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        vec3 base = mix(uTintA, uTintB, uMorph);
        vec3 hot  = vec3(1.0, 0.302, 0.18);
        vec3 color = mix(base, hot, clamp(vHeat * 2.2, 0.0, 1.0));
        gl_FragColor = vec4(color, glow * vAlpha);
      }
    `,
  });

  scene.add(new THREE.Points(geometry, material));

  // --- shape pair management ---
  let pairIdx = -1;
  function writePair(i) {
    shapeA.array.set(slots[i].data);
    shapeB.array.set(slots[Math.min(i + 1, slots.length - 1)].data);
    shapeA.needsUpdate = true;
    shapeB.needsUpdate = true;
    uniforms.uTypeA.value = slots[i].type;
    uniforms.uTypeB.value = slots[Math.min(i + 1, slots.length - 1)].type;
    uniforms.uScaleA.value = slots[i].scale ?? 1;
    uniforms.uScaleB.value = slots[Math.min(i + 1, slots.length - 1)].scale ?? 1;
    uniforms.uDimA.value = slots[i].dim;
    uniforms.uDimB.value = slots[Math.min(i + 1, slots.length - 1)].dim;
    uniforms.uTintA.value.setRGB(...slots[i].tint);
    uniforms.uTintB.value.setRGB(...slots[Math.min(i + 1, slots.length - 1)].tint);
    pairIdx = i;
  }
  writePair(0);

  // --- interaction state ---
  const targetMouse = new THREE.Vector3(99, 99, 99);
  const raycastPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const ndcMouse = new THREE.Vector2();
  let hasMouse = false;

  window.addEventListener("pointermove", (e) => {
    ndcMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndcMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    hasMouse = true;
  });
  window.addEventListener("pointerleave", () => { hasMouse = false; });

  let xScale = 1;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // pull side shapes toward center on narrow screens
    xScale = Math.min(1, Math.max(0.4, camera.aspect / 1.5));
  }
  window.addEventListener("resize", resize);
  resize();

  let targetF = 0;
  let currentF = 0;
  let pulseEnergy = 0;
  const clock = new THREE.Clock();
  if (reducedMotion) uniforms.uTime.value = 12.34;

  function tick() {
    if (!reducedMotion) uniforms.uTime.value = clock.getElapsedTime();

    if (hasMouse) {
      raycaster.setFromCamera(ndcMouse, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(raycastPlane, hit);
      if (hit) targetMouse.copy(hit);
    } else {
      targetMouse.set(99, 99, 99);
    }
    uniforms.uMouse.value.lerp(targetMouse, 0.08);

    currentF += (targetF - currentF) * 0.06;
    const maxIdx = slots.length - 2;
    const idx = Math.min(Math.floor(currentF), maxIdx);
    if (idx !== pairIdx) writePair(idx);
    uniforms.uMorph.value = Math.min(currentF - idx, 1);

    const oa = slots[pairIdx].offset;
    const ob = slots[Math.min(pairIdx + 1, slots.length - 1)].offset;
    uniforms.uOffsetA.value.set(oa[0] * xScale, oa[1], oa[2]);
    uniforms.uOffsetB.value.set(ob[0] * xScale, ob[1], ob[2]);

    pulseEnergy *= 0.92;
    uniforms.uPulse.value = pulseEnergy;

    // depth: camera drifts toward the pointer and sways slowly on its own,
    // so the field reads as a 3D space even when nothing else is moving
    if (!reducedMotion) {
      const t = uniforms.uTime.value;
      const tx = (hasMouse ? ndcMouse.x * 0.28 : 0) + Math.sin(t * 0.07) * 0.06;
      const ty = (hasMouse ? ndcMouse.y * 0.18 : 0) + Math.cos(t * 0.09) * 0.05;
      camera.position.x += (tx - camera.position.x) * 0.03;
      camera.position.y += (ty - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    // f in [0, numShapes-1]; integer values = fully formed shape per section
    setProgress(f) { targetF = Math.max(0, Math.min(f, slots.length - 1)); },
    pulse(strength = 1) { pulseEnergy = Math.min(pulseEnergy + strength * 0.6, 1.4); },
  };
}
