import * as THREE from "three";

// Interactive particle sphere with fisheye-style distortion.
// Mouse repels nearby particles; scroll morphs the sphere.
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
  const positions = new Float32Array(COUNT * 3); // sphere (hero)
  const cloud = new Float32Array(COUNT * 3);     // dust field (mid-page)
  const knot = new Float32Array(COUNT * 3);      // torus knot (contact)
  const randoms = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    // Fibonacci sphere for even distribution
    const t = i / COUNT;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 1.6;
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    // double helix (local coords; offset + spin applied in shader)
    const strand = i % 2;
    const hy = (Math.random() - 0.5) * 6.5;
    const ha = hy * 1.9 + strand * Math.PI;
    const hr = 0.55 + (Math.random() - 0.5) * 0.12;
    // a few stray particles float around the helix like loose dust
    const stray = Math.random() < 0.18;
    if (stray) {
      cloud[i * 3 + 0] = (Math.random() - 0.5) * 3.5;
      cloud[i * 3 + 1] = (Math.random() - 0.5) * 7;
      cloud[i * 3 + 2] = (Math.random() - 0.5) * 3.5;
    } else {
      cloud[i * 3 + 0] = Math.cos(ha) * hr;
      cloud[i * 3 + 1] = hy;
      cloud[i * 3 + 2] = Math.sin(ha) * hr;
    }

    // p=2, q=3 torus knot with a little radial fuzz
    const kt = Math.random() * Math.PI * 2;
    const p = 2, q = 3;
    const rr = Math.cos(q * kt) + 2;
    const fuzz = 0.06 + Math.random() * 0.12;
    const fa = Math.random() * Math.PI * 2;
    knot[i * 3 + 0] = (rr * Math.cos(p * kt)) * 0.52 + Math.cos(fa) * fuzz;
    knot[i * 3 + 1] = (rr * Math.sin(p * kt)) * 0.52 + Math.sin(fa) * fuzz;
    knot[i * 3 + 2] = Math.sin(q * kt) * 0.52 + (Math.random() - 0.5) * fuzz;

    randoms[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aCloud", new THREE.BufferAttribute(cloud, 3));
  geometry.setAttribute("aKnot", new THREE.BufferAttribute(knot, 3));
  geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 99) },
    uScroll: { value: 0 },
    uPulse: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uMidOffset: { value: new THREE.Vector3(2.6, 0, -1.6) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMouse;
      uniform float uScroll;
      uniform float uPulse;
      uniform float uPixelRatio;
      uniform vec3 uMidOffset;
      attribute vec3 aCloud;
      attribute vec3 aKnot;
      attribute float aRandom;
      varying float vAlpha;
      varying float vHeat;

      void main() {
        // shape morph: sphere -> double helix -> torus knot
        float toMid  = smoothstep(0.05, 0.42, uScroll);
        float toKnot = smoothstep(0.62, 0.95, uScroll);

        // helix spins around its own axis, pushed off to the side
        vec3 hpos = aCloud;
        float hspin = uTime * 0.3;
        float hc = cos(hspin), hs = sin(hspin);
        hpos.xz = mat2(hc, -hs, hs, hc) * hpos.xz;
        hpos += uMidOffset;
        // gentle vertical sway so it feels alive
        hpos.y += sin(uTime * 0.2 + aRandom * 6.2831) * 0.15;

        // particles travel at slightly different speeds for a dissolve feel
        float lag = clamp(toMid + (aRandom - 0.5) * 0.3, 0.0, 1.0);
        vec3 pos = mix(position, hpos, lag);

        // reassemble into the knot, spinning slowly
        vec3 kpos = aKnot;
        float spin = uTime * 0.22;
        float cs = cos(spin), sn = sin(spin);
        kpos.xz = mat2(cs, -sn, sn, cs) * kpos.xz;
        kpos.yz = mat2(cs, sn, -sn, cs) * kpos.yz;
        float klag = clamp(toKnot + (aRandom - 0.5) * 0.25, 0.0, 1.0);
        pos = mix(pos, kpos, klag);

        // organic breathing
        float wave = sin(uTime * 0.6 + aRandom * 6.2831) * 0.05;
        pos += normalize(position) * wave * (1.0 - toMid * 0.7);

        // tabla pulse: radial shockwave
        pos += normalize(pos) * uPulse * (0.25 + aRandom * 0.35);

        // mouse repulsion (in world-ish space)
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
        float fish = 1.0 + 0.35 * (1.0 - rad * rad) * (1.0 - toMid * 0.6 + toKnot * 0.4);
        clip.xy *= fish;

        gl_Position = clip;
        gl_PointSize = (1.4 + aRandom * 2.2 + force * 3.0) * uPixelRatio * (3.4 / -mv.z);

        // helix stays dimmer so text reads cleanly; knot glows back up
        float dim = mix(1.0, 0.45, toMid * (1.0 - toKnot));
        vAlpha = (0.35 + aRandom * 0.4) * dim;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vHeat;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        vec3 base = vec3(0.949, 0.941, 0.918);   // warm white
        vec3 hot  = vec3(1.0, 0.302, 0.18);      // accent orange-red
        vec3 color = mix(base, hot, clamp(vHeat * 2.2, 0.0, 1.0));
        gl_FragColor = vec4(color, glow * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

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

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // keep the helix visible on narrow screens, off to the side on wide ones
    uniforms.uMidOffset.value.x = Math.min(2.6, Math.max(0.9, camera.aspect * 1.7));
  }
  window.addEventListener("resize", resize);
  resize();

  let scrollTarget = 0;
  let pulseEnergy = 0;
  const clock = new THREE.Clock();

  function tick() {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;

    if (hasMouse) {
      raycaster.setFromCamera(ndcMouse, camera);
      const hit = new THREE.Vector3();
      raycaster.ray.intersectPlane(raycastPlane, hit);
      if (hit) targetMouse.copy(hit);
    } else {
      targetMouse.set(99, 99, 99);
    }
    uniforms.uMouse.value.lerp(targetMouse, 0.08);

    uniforms.uScroll.value += (scrollTarget - uniforms.uScroll.value) * 0.05;

    pulseEnergy *= 0.92;
    uniforms.uPulse.value = pulseEnergy;

    if (!reducedMotion) {
      // only spin the object in the hero; the knot spins in-shader
      points.rotation.y = t * 0.05 * Math.max(0, 1 - uniforms.uScroll.value * 2);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    setScroll(v) { scrollTarget = v; },
    pulse(strength = 1) { pulseEnergy = Math.min(pulseEnergy + strength * 0.6, 1.4); },
  };
}
