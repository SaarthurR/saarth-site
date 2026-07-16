import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Snap from "lenis/snap";
import { createScene } from "./scene.js";
import { playBol } from "./tabla.js";

gsap.registerPlugin(ScrollTrigger);
window.__ST = ScrollTrigger; // debug handle for the verify scripts

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Three.js background ---------- */
const sceneApi = createScene(document.getElementById("webgl"), { reducedMotion });

/* ---------- Smooth scroll (Lenis + GSAP) ---------- */
let lenis = null;
if (!reducedMotion) {
  // duration + expo easing = floaty glide: the page keeps drifting after the
  // wheel stops instead of tracking the fingers 1:1
  lenis = new Lenis({
    duration: 2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.9,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- Pinned sections ---------- */
// Every pin is created strictly in DOM order. ScrollTrigger only bakes a
// pin's spacer into triggers created after it, so creating the about pin out
// of order pushed every section below it ~a full viewport out of sync: pins
// grabbed sections before they reached center, reveals finished off-screen,
// and about + projects pinned on top of each other.
const aboutText = document.getElementById("aboutText");
aboutText.innerHTML = aboutText.textContent.trim().split(/\s+/)
  .map((w) => `<span class="w">${w}</span>`).join(" ");

const EXIT = 0.3; // last 30vh of each pin window is the fly-out zone

const shapePins = [];
let aboutPin = null;
gsap.utils.toArray("[data-shape], .about").forEach((section) => {
  if (section.classList.contains("about")) {
    // page holds still while the paragraph lights up word by word under the wheel
    if (!reducedMotion) {
      aboutPin = ScrollTrigger.create({
        trigger: section,
        start: "center center",
        end: "+=90%",
        pin: true,
        scrub: true,
        animation: gsap.fromTo("#aboutText .w", { opacity: 0.12 }, { opacity: 1, stagger: 0.08, ease: "none" }),
      });
    }
    return;
  }
  // Each [data-shape] section pins at viewport center. The first stretch of
  // the pin holds the content fully formed; the EXIT stretch flies it out, so
  // the section is already empty before the next one scrolls into view.
  shapePins.push(ScrollTrigger.create({
    trigger: section,
    start: "center center",
    end: "+=60%",
    pin: true,
  }));
});

// Where a section rests fully formed: the middle of the hold zone (pin window
// minus the fly-out stretch). Contact and about never fly out.
const restPoint = (pin) =>
  pin === shapePins[shapePins.length - 1] || pin === aboutPin
    ? (pin.start + pin.end) / 2
    : pin.start + (pin.end - pin.start - window.innerHeight * EXIT) / 2;

// If the user stops scrolling *near* a section's pin window, gently settle
// onto its rest point. Proximity (not mandatory) snap: stopping anywhere
// else — hero, footer, halfway between sections — leaves the page exactly
// where the user left it, so scrolling never feels hijacked.
if (lenis) {
  const snap = new Snap(lenis, {
    type: "proximity",
    distanceThreshold: "25%",
    debounce: 500,
    duration: 1.1,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  let removeSnaps = [];
  const rebuildSnaps = () => {
    removeSnaps.forEach((remove) => remove());
    removeSnaps = shapePins.map((p) => snap.add(restPoint(p)));
  };
  rebuildSnaps();
  ScrollTrigger.addEventListener("refresh", rebuildSnaps); // pin positions move on resize
}

// ScrollTrigger pushes triggers created after a pin past that pin's spacer,
// even when the trigger element lives INSIDE the pinned section — so reveals
// there would fire only after the pin releases. Anchor those to the pin's own
// scroll position instead of the element.
const pinOf = (el) => {
  const sec = el.closest("[data-shape], .about");
  if (!sec) return null;
  return shapePins.find((p) => p.trigger === sec)
    || (aboutPin && aboutPin.trigger === sec ? aboutPin : null);
};
const revealAt = (el) => {
  const pin = pinOf(el);
  // reverse on the way back up so re-entering a section replays its reveal
  // instead of popping stale end-states into place
  return pin
    ? { start: () => pin.start - window.innerHeight * 0.4, toggleActions: "play none none reverse" }
    : { trigger: el, start: "top 88%", toggleActions: "play none none reverse" };
};

/* ---------- Scroll theatrics ---------- */
let heroBlown = false; // magnet effect stands down while the title is scattering
if (!reducedMotion) {
  // hero title blows apart letter by letter during the tail of its pin — each
  // char rips off at its own moment, so it reads as wind instead of a fade
  const heroPin = shapePins[0];
  gsap.timeline({
    scrollTrigger: {
      start: () => heroPin.end - window.innerHeight * EXIT,
      end: () => heroPin.end,
      scrub: true,
      onUpdate: (self) => { heroBlown = self.progress > 0; },
    },
  })
    .to(".hero-char", {
      x: () => gsap.utils.random(-520, 520),
      y: () => gsap.utils.random(-480, -140),
      rotation: () => gsap.utils.random(-220, 220),
      scale: () => gsap.utils.random(0.2, 1.3),
      opacity: 0,
      duration: 0.6,
      ease: "power2.in",
      stagger: { each: 0.05, from: "random" },
    }, 0)
    .to(".hero-eyebrow, .hero-sub, .hero-scroll", { opacity: 0, y: -80, ease: "power1.in", duration: 0.7 }, 0);

  // every other pinned section (except the last) flies its content upward
  // during the tail of its own pin — while it still owns the whole viewport,
  // never on top of the next section
  shapePins.slice(1, -1).forEach((pin) => {
    gsap.to(Array.from(pin.trigger.children), {
      y: -130,
      rotation: -3,
      opacity: 0,
      stagger: 0.08,
      ease: "power1.in",
      scrollTrigger: {
        start: () => pin.end - window.innerHeight * EXIT,
        end: () => pin.end,
        scrub: true,
      },
    });
  });

  // stack rows shear past each other in alternating directions
  gsap.utils.toArray(".stack-row").forEach((row, i) => {
    const dir = i % 2 ? 1 : -1;
    gsap.fromTo(row,
      { xPercent: 9 * dir, rotation: 2.5 * dir },
      {
        xPercent: -9 * dir,
        rotation: -2.5 * dir,
        ease: "none",
        scrollTrigger: { trigger: row, start: "top bottom", end: "bottom top", scrub: true },
      });
    gsap.from(row, {
      opacity: 0,
      duration: 0.8,
      scrollTrigger: { trigger: row, start: "top 92%", toggleActions: "play none none reverse" },
    });
  });

  // giant outlined name drags sideways with the scroll
  gsap.fromTo(".giant-text", { xPercent: 2 }, {
    xPercent: -32,
    ease: "none",
    scrollTrigger: { trigger: ".giant-strip", start: "top bottom", end: "bottom top", scrub: true },
  });

  // velocity skew: content leans into fast scrolls, settles when you stop
  const skewSetter = gsap.quickSetter(".skew", "skewY", "deg");
  let skew = 0;
  let skewTarget = 0;
  lenis.on("scroll", ({ velocity }) => {
    skewTarget = gsap.utils.clamp(-4, 4, velocity * 0.06);
  });
  gsap.ticker.add(() => {
    skewTarget *= 0.92;
    skew += (skewTarget - skew) * 0.12;
    skewSetter(skew);
  });
}

gsap.ticker.add(() => {
  const y = window.scrollY;
  const n = shapePins.length;
  if (!n) return;
  let f = n - 1;
  if (y <= shapePins[0].end) {
    f = 0;
  } else if (y < shapePins[n - 1].start) {
    for (let k = 0; k < n - 1; k++) {
      if (y < shapePins[k + 1].start) {
        f = y <= shapePins[k].end
          ? k
          : k + (y - shapePins[k].end) / (shapePins[k + 1].start - shapePins[k].end);
        break;
      }
    }
  }
  sceneApi.setProgress(f);
});

/* ---------- Preloader + hero intro ---------- */
const preloader = document.getElementById("preloader");
const countEl = document.getElementById("preloaderCount");

function runIntro() {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const counter = { v: 0 };

  tl.to(counter, {
    v: 100,
    duration: reducedMotion ? 0.01 : 1.4,
    ease: "power2.inOut",
    onUpdate: () => { countEl.textContent = String(Math.round(counter.v)).padStart(2, "0"); },
  })
    .to(preloader, {
      yPercent: -100,
      duration: reducedMotion ? 0.01 : 0.8,
      ease: "power4.inOut",
      onComplete: () => preloader.remove(),
    })
    .from(reducedMotion ? ".hero-char" : ".hero-row:not(.hero-row-swap) .hero-char", {
      yPercent: 120,
      rotateX: -90,
      stagger: 0.06,
      duration: 1,
      ease: "back.out(1.4)",
    }, "-=0.35")
    .addLabel("cycle")
    .from(".hero-eyebrow .line, .hero-sub .line", {
      y: 24,
      opacity: 0,
      stagger: 0.12,
      duration: 0.7,
    }, "-=0.6")
    .from(".nav, .hero-scroll", { opacity: 0, duration: 0.6 }, "-=0.4");

  if (!reducedMotion) {
    // slot reel: one continuous scroll through the portfolio that decelerates
    // straight into REAL THINGS — no per-word stops. A light box frames the
    // reel while it rolls, then fades once it lands. The real chars stay in
    // the DOM (display:none) so the magnet and blow-away tweens keep working;
    // the reel's last item copies .hero-row metrics so the swap is seamless.
    // leading "" = empty cell so the reel starts blank until I SHIP has landed
    const words = ["", "TRADING BOTS", "STUDY SITES", "BACKTESTS", "CRMs",
      "PHYSICS SIMS", "PROXIED SITES", "EMAIL TOOLS", "GAME SITES", "STRATEGIES",
      "DASHBOARDS", "TABLA LOOPS", "LIVE SYSTEMS", "ROBOT CODE", "PHYSICAL AI",
      "REAL THINGS"];
    const row = document.querySelector(".hero-row-swap");
    const finalWords = row.querySelectorAll(".hero-word");
    const reel = document.createElement("span");
    reel.className = "hero-reel";
    reel.innerHTML =
      '<span class="hero-reel-win"><span class="hero-reel-track">' +
      words.map((w, i) =>
        `<span class="hero-reel-item${i < words.length - 1 ? " is-mid" : ""}">` +
        w.split(" ").map((p) => `<span>${p}</span>`).join("") +
        "</span>").join("") +
      '</span></span><span class="hero-reel-box"></span>';
    gsap.set(finalWords, { display: "none" });
    row.appendChild(reel);
    const track = reel.querySelector(".hero-reel-track");
    const box = reel.querySelector(".hero-reel-box");

    // sequence: box fades in with the first word → two slow ticks that pick up
    // speed → continuous blurred spin decelerating into REAL THINGS → box
    // fades as it lands
    const n = words.length;
    const at = (i) => -100 * i / n; // yPercent that centers item i in the window
    const ct = gsap.timeline();
    ct.to(box, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, 0)
      .to(track, { yPercent: at(1), duration: 0.55, ease: "power3.out" }, 0)
      .to(track, { yPercent: at(2), duration: 0.65, ease: "power1.inOut" }, 1.05)
      .to(track, { yPercent: at(3), duration: 0.45, ease: "power1.inOut" }, 1.85)
      .to(track, { yPercent: at(n - 1), duration: 1.9, ease: "power2.inOut" }, 2.4)
      .to(track, { filter: "blur(8px)", duration: 0.45, ease: "power2.in" }, 2.55)
      .to(track, { filter: "blur(0px)", duration: 0.6, ease: "power2.out" }, 3.7)
      .to(box, { opacity: 0, duration: 0.35 }, 4.25)
      .call(() => {
        reel.remove();
        gsap.set(finalWords, { clearProps: "display" });
      });
    tl.add(ct, "cycle");
  }
}
window.addEventListener("load", runIntro);

/* ---------- Hero title magnet effect ---------- */
if (!reducedMotion && matchMedia("(hover: hover)").matches) {
  const chars = document.querySelectorAll(".hero-char");
  window.addEventListener("pointermove", (e) => {
    if (heroBlown) return; // don't fight the scroll-scrubbed scatter
    chars.forEach((ch) => {
      const r = ch.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 220;
      if (dist < max) {
        const f = (1 - dist / max) * 26;
        gsap.to(ch, { x: (-dx / dist) * f, y: (-dy / dist) * f, duration: 0.4, ease: "power2.out" });
      } else {
        gsap.to(ch, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
      }
    });
  });
}

/* ---------- Section reveal animations ---------- */
// wrap reveal-line contents for masked reveals
document.querySelectorAll(".reveal-line").forEach((el) => {
  const inner = document.createElement("span");
  inner.className = "inner";
  inner.innerHTML = el.innerHTML;
  el.innerHTML = "";
  el.appendChild(inner);
});

gsap.utils.toArray(".reveal-line .inner").forEach((el) => {
  gsap.from(el, {
    yPercent: 110,
    duration: 1,
    ease: "power4.out",
    scrollTrigger: revealAt(el),
  });
});

gsap.utils.toArray(".reveal-block").forEach((el) => {
  gsap.from(el, {
    y: 40,
    opacity: 0,
    duration: 1,
    ease: "power3.out",
    scrollTrigger: revealAt(el),
  });
});

// project cards swing up from below, scrubbed to the scroll, settling flat
// exactly as the section locks into its pin
gsap.utils.toArray(".project-view").forEach((sec, i) => {
  const pin = shapePins.find((p) => p.trigger === sec);
  gsap.fromTo(sec.querySelector(".project"),
    { y: 180, rotation: i % 2 ? 7 : -7, scale: 0.8, opacity: 0 },
    {
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
      ease: "none",
      scrollTrigger: {
        // wide approach window + scrub smoothing so the card visibly glides
        // in and settles just before the pin locks, even mid-snap-glide
        start: () => pin.start - window.innerHeight * 0.55,
        end: () => pin.start - window.innerHeight * 0.08,
        scrub: 0.8,
      },
    });
});

// index numbers spin in
gsap.utils.toArray(".section-index, .project-num").forEach((el) => {
  gsap.from(el, {
    rotation: 270,
    scale: 0,
    opacity: 0,
    duration: 0.9,
    ease: "back.out(1.7)",
    scrollTrigger: revealAt(el),
  });
});

// stat tiles flip up like departure-board cards
gsap.from(".stat", {
  yPercent: 80,
  opacity: 0,
  rotateX: -70,
  transformPerspective: 700,
  transformOrigin: "center top",
  stagger: 0.12,
  duration: 1,
  ease: "power3.out",
  scrollTrigger: { trigger: ".stats-grid", start: "top 82%", toggleActions: "play none none reverse" },
});

/* ---------- Animated stat counters ---------- */
gsap.utils.toArray(".stat-num").forEach((el) => {
  const target = parseFloat(el.dataset.count);
  const decimals = el.dataset.count.includes(".") ? 1 : 0;
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target,
    duration: 1.6,
    ease: "power2.out",
    scrollTrigger: revealAt(el),
    onUpdate: () => { el.textContent = obj.v.toFixed(decimals); },
  });
});

/* ---------- Marquee ---------- */
if (!reducedMotion) {
  const track = document.getElementById("marqueeTrack");
  const marqueeTween = gsap.to(track, { xPercent: -50, ease: "none", duration: 22, repeat: -1 });
  // scroll velocity whips the marquee faster; scrolling up runs it backwards
  let ts = 1;
  let tsTarget = 1;
  lenis?.on("scroll", ({ velocity }) => {
    tsTarget = gsap.utils.clamp(-6, 6, 1 + velocity * 0.09);
  });
  gsap.ticker.add(() => {
    tsTarget += (1 - tsTarget) * 0.04;
    ts += (tsTarget - ts) * 0.1;
    marqueeTween.timeScale(ts);
  });
}

/* ---------- Custom cursor ---------- */
const dot = document.getElementById("cursorDot");
const ring = document.getElementById("cursorRing");
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { ...pos };
  let magnetEl = null;
  // cursor stays invisible until the pointer actually moves — otherwise the
  // red dot sits parked at screen center over every section
  window.addEventListener("pointermove", (e) => {
    pos.x = e.clientX;
    pos.y = e.clientY;
    if (!dot.classList.contains("is-on")) {
      ringPos.x = pos.x;
      ringPos.y = pos.y;
      dot.classList.add("is-on");
      ring.classList.add("is-on");
    }
  });
  gsap.ticker.add(() => {
    let tx = pos.x;
    let ty = pos.y;
    if (magnetEl) {
      // pull the ring partway toward small targets (nav links, pads, email)
      const r = magnetEl.getBoundingClientRect();
      if (r.width < 260) {
        tx += (r.left + r.width / 2 - pos.x) * 0.35;
        ty += (r.top + r.height / 2 - pos.y) * 0.35;
      }
    }
    ringPos.x += (tx - ringPos.x) * 0.18;
    ringPos.y += (ty - ringPos.y) * 0.18;
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%,-50%)`;
  });
  document.querySelectorAll("[data-cursor]").forEach((el) => {
    const mode = el.dataset.cursor;
    el.addEventListener("pointerenter", () => {
      ring.classList.add(`is-${mode}`);
      magnetEl = el;
    });
    el.addEventListener("pointerleave", () => {
      ring.classList.remove(`is-${mode}`);
      if (magnetEl === el) magnetEl = null;
    });
  });
} else {
  dot.remove();
  ring.remove();
}

/* ---------- Playable tabla ---------- */
const pads = document.querySelectorAll(".pad");
const padByKey = { 1: "dha", 2: "tin", 3: "na", 4: "ge" };

function hitPad(pad) {
  playBol(pad.dataset.bol);
  sceneApi.pulse(1);
  gsap.fromTo(pad,
    { scale: 0.92, borderColor: "#ff4d2e" },
    { scale: 1, borderColor: "rgba(242,240,234,0.12)", duration: 0.45, ease: "elastic.out(1, 0.45)" }
  );
}

pads.forEach((pad) => pad.addEventListener("pointerdown", () => hitPad(pad)));

// one-time "come play" ripple across the pads when they scroll into view
if (!reducedMotion && pads.length) {
  ScrollTrigger.create({
    ...revealAt(document.querySelector(".tabla-pads")),
    once: true,
    onEnter: () => {
      gsap.fromTo(".pad",
        { scale: 1 },
        { scale: 1.08, duration: 0.28, yoyo: true, repeat: 1, stagger: 0.14, ease: "power2.inOut" }
      );
    },
  });
}

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
  const bol = padByKey[e.key];
  if (bol) {
    const pad = document.querySelector(`.pad[data-bol="${bol}"]`);
    if (pad) hitPad(pad);
  }
});

/* ---------- Anchor links work with Lenis + pinned sections ---------- */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    // pinned sections live inside pin-spacers, so jump to the pin's
    // rest point (mid-hold, before the fly-out) rather than the element
    const pin = shapePins.find((p) => p.trigger === target)
      || (aboutPin && aboutPin.trigger === target ? aboutPin : null);
    if (lenis) {
      e.preventDefault();
      if (pin) lenis.scrollTo(restPoint(pin));
      else lenis.scrollTo(target, { offset: -40 });
    } else if (pin) {
      e.preventDefault();
      window.scrollTo(0, restPoint(pin));
    }
  });
});
