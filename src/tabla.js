// Synthesized tabla bols using the Web Audio API. No samples needed.
let ctx;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function envGain(ac, peak, decay) {
  const g = ac.createGain();
  const now = ac.currentTime;
  g.gain.setValueAtTime(peak, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
  return g;
}

// Dha: deep resonant bass (baya) + sharp strike
function dha(ac) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(58, now + 0.28);
  const g = envGain(ac, 0.9, 0.5);
  osc.connect(g).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.55);
  strike(ac, 700, 0.12, 0.25);
}

// Tin: ringing rim tone (high, sustained)
function tin(ac) {
  const now = ac.currentTime;
  [552, 828, 1104].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = envGain(ac, 0.28 / (i + 1), 0.7 - i * 0.15);
    osc.connect(g).connect(ac.destination);
    osc.start(now); osc.stop(now + 0.8);
  });
}

// Na: crisp slap, short ring
function na(ac) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 740;
  const g = envGain(ac, 0.4, 0.18);
  osc.connect(g).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.22);
  strike(ac, 2400, 0.2, 0.06);
}

// Ge: bass bend (baya pitch slide)
function ge(ac) {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(75, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.18);
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.4);
  const g = envGain(ac, 0.85, 0.45);
  osc.connect(g).connect(ac.destination);
  osc.start(now); osc.stop(now + 0.5);
}

// noise burst for attack transients
function strike(ac, cutoff, gainV, decay) {
  const len = ac.sampleRate * decay;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = cutoff;
  const g = envGain(ac, gainV, decay);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

const bols = { dha, tin, na, ge };

export function playBol(name) {
  const ac = audio();
  const fn = bols[name];
  if (fn) fn(ac);
}
