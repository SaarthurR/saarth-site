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
    const x = (Math.random() - 0.5) * 3.6;
    let y = (Math.random() - 0.5) * 0.06;
    let z = (Math.random() - 0.5) * 2.2;
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
    params.push({ x: -1.55 + i * 0.28, base, height });
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
      (Math.random() - 0.5) * 3.2,
      (Math.random() - 0.5) * 2.4,
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
  // baya (bigger, left) + dayan (smaller, right), tilted steeply so the
  // drumheads face the viewer. Each head reads as a real tabla top:
  // a dense kinar/gajra ring at the rim, a sparse maidan, and a clearly
  // outlined syahi circle — off-center on the baya, centered on the dayan.
  const drums = [
    { cx: -1.1, topR: 0.85, botR: 0.6, topY: 0.25, botY: -0.8, syahiR: 0.3, syX: -0.2 },
    { cx: 0.95, topR: 0.6, botR: 0.42, topY: 0.35, botY: -0.7, syahiR: 0.22, syX: 0 },
  ];
  const tilt = -0.95, c = Math.cos(tilt), s = Math.sin(tilt);
  const STRAPS = 9;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const d = drums[Math.random() < 0.5 ? 0 : 1];
    let x, y, z;
    const pick = Math.random();
    if (pick < 0.24) {
      // kinar + gajra: dense braided ring at the rim
      const r = d.topR * (0.9 + Math.random() * 0.1);
      const a = Math.random() * Math.PI * 2;
      x = d.cx + Math.cos(a) * r;
      y = d.topY - Math.random() * 0.05;
      z = Math.sin(a) * r;
    } else if (pick < 0.4) {
      // syahi edge: dense ring outlining the black paste circle
      const r = d.syahiR * (0.88 + Math.random() * 0.12);
      const a = Math.random() * Math.PI * 2;
      x = d.cx + d.syX + Math.cos(a) * r;
      y = d.topY + 0.02;
      z = Math.sin(a) * r;
    } else if (pick < 0.5) {
      // syahi fill: light speckle inside the circle
      const r = d.syahiR * 0.88 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      x = d.cx + d.syX + Math.cos(a) * r;
      y = d.topY + 0.02;
      z = Math.sin(a) * r;
    } else if (pick < 0.68) {
      // maidan: sparse skin between syahi and rim
      const a = Math.random() * Math.PI * 2;
      const r = d.topR * (0.2 + 0.7 * Math.sqrt(Math.random()));
      x = d.cx + Math.cos(a) * r;
      y = d.topY;
      z = Math.sin(a) * r;
    } else if (pick < 0.86) {
      // tasma: leather straps lacing down the body
      const a = ((Math.random() * STRAPS) | 0) / STRAPS * Math.PI * 2 + 0.3;
      const t = Math.random();
      const r = d.botR + (d.topR - d.botR) * t;
      x = d.cx + Math.cos(a) * r + (Math.random() - 0.5) * 0.03;
      y = d.botY + (d.topY - d.botY) * t;
      z = Math.sin(a) * r + (Math.random() - 0.5) * 0.03;
    } else {
      // body shell: faint tapered drum wall
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

// Order matches the [data-shape] sections in the DOM. Each slot carries a
// tint so the particle field's color narrates the journey section by section;
// tints stay desaturated so the system still reads as one palette.
const WARM_WHITE = [0.949, 0.941, 0.918];
export function buildShapes(count) {
  const orb = sphere(count);
  return [
    { data: orb, offset: [0, 0, 0], dim: 0.9, scale: 0.72, type: TYPE.BREATH, tint: WARM_WHITE }, // hero — smaller so it frames the title instead of swallowing it
    { data: orb, offset: [2.0, 0, -0.6], dim: 0.7, type: TYPE.BREATH, tint: WARM_WHITE },     // projects intro (orb glides right)
    { data: waveField(count), offset: [1.35, 0.1, -0.4], dim: 0.55, type: TYPE.WAVE, tint: [0.72, 0.88, 0.95] },  // physics — cool cyan
    { data: invader(count), offset: [1.35, 0, -0.4], dim: 0.55, type: TYPE.SWAY, tint: [0.81, 0.76, 0.96] },      // ascenta — arcade violet
    { data: candles(count), offset: [1.35, 0, -0.4], dim: 0.55, type: TYPE.SWAY, tint: [0.72, 0.92, 0.77] },      // trading — ticker green
    { data: network(count), offset: [1.35, 0, -0.4], dim: 0.55, type: TYPE.SPIN, tint: [0.72, 0.81, 0.96] },      // crm — wire blue
    { data: envelope(count), offset: [1.35, 0, -0.4], dim: 0.55, type: TYPE.SWAY, tint: [0.96, 0.90, 0.78] },     // now — paper cream
    { data: tabla(count), offset: [1.3, 0.1, -0.4], dim: 0.65, type: TYPE.SWAY, tint: [0.96, 0.82, 0.64] },       // tabla — wood amber
    { data: knot(count), offset: [0, 0, 0], dim: 1.0, type: TYPE.TUMBLE, tint: WARM_WHITE },  // contact
  ];
}
