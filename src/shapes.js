// Procedural particle shapes. All shapes are centered on their own origin;
// world offset, dimming, and animation type are applied in the shader.
export const TYPE = { SWAY: 0, BREATH: 1, WAVE: 2, SPIN: 3, TUMBLE: 4 };

function sphere(count) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 1.6;
    out[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.cos(phi);
    out[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return out;
}

// flat field of points; the shader animates it into traveling interference waves
function waveField(count) {
  const out = new Float32Array(count * 3);
  const tilt = -0.3, c = Math.cos(tilt), s = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 4.6;
    let y = (Math.random() - 0.5) * 0.06;
    let z = (Math.random() - 0.5) * 2.6;
    const y2 = y * c - z * s;
    const z2 = y * s + z * c;
    out[i * 3 + 0] = x;
    out[i * 3 + 1] = y2;
    out[i * 3 + 2] = z2;
  }
  return out;
}

const INVADER = [
  "00100000100",
  "00010001000",
  "00111111100",
  "01101110110",
  "11111111111",
  "10111111101",
  "10100000101",
  "00011011000",
];

function invader(count) {
  const cells = [];
  INVADER.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === "1") cells.push([c, r]);
  });
  const px = 0.27;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [c, r] = cells[(Math.random() * cells.length) | 0];
    out[i * 3 + 0] = (c - 5) * px + (Math.random() - 0.5) * px * 0.85;
    out[i * 3 + 1] = (3.5 - r) * px + (Math.random() - 0.5) * px * 0.85;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
  }
  return out;
}

function candles(count) {
  const N = 12;
  const params = [];
  for (let i = 0; i < N; i++) {
    const base = -0.85 + i * 0.14 + (Math.random() - 0.5) * 0.22;
    const height = 0.28 + Math.random() * 0.42;
    params.push({ x: -1.9 + i * 0.345, base, height });
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const k = params[(Math.random() * N) | 0];
    if (Math.random() < 0.72) {
      // body
      out[i * 3 + 0] = k.x + (Math.random() - 0.5) * 0.15;
      out[i * 3 + 1] = k.base + Math.random() * k.height;
      out[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    } else {
      // wick
      out[i * 3 + 0] = k.x + (Math.random() - 0.5) * 0.025;
      out[i * 3 + 1] = k.base - 0.18 + Math.random() * (k.height + 0.36);
      out[i * 3 + 2] = (Math.random() - 0.5) * 0.025;
    }
  }
  return out;
}

function network(count) {
  const N = 24;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    nodes.push([
      (Math.random() - 0.5) * 4.2,
      (Math.random() - 0.5) * 2.6,
      (Math.random() - 0.5) * 1.0,
    ]);
  }
  // connect each node to its two nearest neighbours
  const edges = [];
  for (let i = 0; i < N; i++) {
    const dists = nodes
      .map((n, j) => [j, Math.hypot(n[0] - nodes[i][0], n[1] - nodes[i][1], n[2] - nodes[i][2])])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1]);
    edges.push([i, dists[0][0]], [i, dists[1][0]]);
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.14;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.55) {
      const n = nodes[(Math.random() * N) | 0];
      out[i * 3 + 0] = n[0] + gauss();
      out[i * 3 + 1] = n[1] + gauss();
      out[i * 3 + 2] = n[2] + gauss();
    } else {
      const [a, b] = edges[(Math.random() * edges.length) | 0];
      const t = Math.random();
      out[i * 3 + 0] = nodes[a][0] + (nodes[b][0] - nodes[a][0]) * t + (Math.random() - 0.5) * 0.03;
      out[i * 3 + 1] = nodes[a][1] + (nodes[b][1] - nodes[a][1]) * t + (Math.random() - 0.5) * 0.03;
      out[i * 3 + 2] = nodes[a][2] + (nodes[b][2] - nodes[a][2]) * t + (Math.random() - 0.5) * 0.03;
    }
  }
  return out;
}

function envelope(count) {
  const TL = [-1.6, 1.0], TR = [1.6, 1.0], BL = [-1.6, -1.0], BR = [1.6, -1.0], APEX = [0, -0.05];
  const segs = [[TL, TR], [TR, BR], [BR, BL], [BL, TL], [TL, APEX], [TR, APEX]];
  const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((s, l) => s + l, 0);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.12) {
      // faint paper fill
      out[i * 3 + 0] = (Math.random() - 0.5) * 3.1;
      out[i * 3 + 1] = (Math.random() - 0.5) * 1.9;
      out[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      continue;
    }
    let pick = Math.random() * total, si = 0;
    while (pick > lens[si]) { pick -= lens[si]; si++; }
    const [a, b] = segs[si];
    const t = pick / lens[si];
    out[i * 3 + 0] = a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * 0.04;
    out[i * 3 + 1] = a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * 0.04;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
  }
  return out;
}

function tabla(count) {
  // dayan (smaller, left) + baya (bigger, right), tilted so the tops show
  const drums = [
    { cx: -1.05, topR: 0.62, botR: 0.45, topY: 0.35, botY: -0.75 },
    { cx: 0.95, topR: 0.85, botR: 0.62, topY: 0.2, botY: -0.8 },
  ];
  const tilt = -0.5, c = Math.cos(tilt), s = Math.sin(tilt);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const d = drums[Math.random() < 0.45 ? 0 : 1];
    let x, y, z;
    if (Math.random() < 0.42) {
      // drum head
      const r = d.topR * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      x = d.cx + Math.cos(a) * r;
      y = d.topY;
      z = Math.sin(a) * r;
    } else {
      // tapered body
      const t = Math.random();
      const r = d.botR + (d.topR - d.botR) * t;
      const a = Math.random() * Math.PI * 2;
      x = d.cx + Math.cos(a) * r;
      y = d.botY + (d.topY - d.botY) * t;
      z = Math.sin(a) * r;
    }
    out[i * 3 + 0] = x;
    out[i * 3 + 1] = y * c - z * s;
    out[i * 3 + 2] = y * s + z * c;
  }
  return out;
}

function knot(count) {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const kt = Math.random() * Math.PI * 2;
    const p = 2, q = 3;
    const rr = Math.cos(q * kt) + 2;
    const fuzz = 0.06 + Math.random() * 0.12;
    const fa = Math.random() * Math.PI * 2;
    out[i * 3 + 0] = rr * Math.cos(p * kt) * 0.52 + Math.cos(fa) * fuzz;
    out[i * 3 + 1] = rr * Math.sin(p * kt) * 0.52 + Math.sin(fa) * fuzz;
    out[i * 3 + 2] = Math.sin(q * kt) * 0.52 + (Math.random() - 0.5) * fuzz;
  }
  return out;
}

// Order matches the [data-shape] sections in the DOM.
export function buildShapes(count) {
  const orb = sphere(count);
  return [
    { data: orb, offset: [0, 0, 0], dim: 1.0, type: TYPE.BREATH },          // hero
    { data: orb, offset: [2.2, 0, -0.6], dim: 0.7, type: TYPE.BREATH },     // projects intro (orb glides right)
    { data: waveField(count), offset: [1.7, 0.1, -0.4], dim: 0.55, type: TYPE.WAVE },   // physics
    { data: invader(count), offset: [1.7, 0, -0.4], dim: 0.55, type: TYPE.SWAY },       // ascenta
    { data: candles(count), offset: [1.7, 0, -0.4], dim: 0.55, type: TYPE.SWAY },       // trading
    { data: network(count), offset: [1.7, 0, -0.4], dim: 0.55, type: TYPE.SPIN },       // crm
    { data: envelope(count), offset: [1.7, 0, -0.4], dim: 0.55, type: TYPE.SWAY },      // now
    { data: tabla(count), offset: [1.6, 0.1, -0.4], dim: 0.65, type: TYPE.SWAY },       // tabla
    { data: knot(count), offset: [0, 0, 0], dim: 1.0, type: TYPE.TUMBLE },  // contact
  ];
}
