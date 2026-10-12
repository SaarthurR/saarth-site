import { inject } from '@vercel/analytics';
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Snap from "lenis/snap";
import { createScene } from "./scene.js";
import { createHelix } from "./helix.js";

// Initialize Vercel Web Analytics
inject();

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
    duration: 1.2,
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
    // the car section holds longer: scrolling through it turns the photo helix
    end: section.id === "offscreen" ? "+=260%" : "+=60%",
    pin: true,
  }));
});

// Where a section rests fully formed: the middle of the hold zone (pin window
// minus the fly-out stretch). Contact and about never fly out.
const restPoint = (pin) =>
  pin.trigger.id === "offscreen" ? pin.start + 2 // land on the first photo, not mid-helix
  : pin === shapePins[shapePins.length - 1] || pin === aboutPin
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
    // no snap on the car section: it would yank the helix while you scroll it
    removeSnaps = shapePins.filter((p) => p.trigger.id !== "offscreen").map((p) => snap.add(restPoint(p)));
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
  // project cards fly out their inner parts, not the card itself: the card is
  // already driven by the swing-in tween, and two tweens on one element jitter
  shapePins.slice(1, -1).forEach((pin) => {
    const card = pin.trigger.querySelector(".project");
    // fromTo with an explicit visible start: a plain .to() would record the
    // reveal's hidden from-state as its start, and scrolling back up would
    // scrub the content back to invisible
    gsap.fromTo(Array.from((card || pin.trigger).children), { y: 0, opacity: 1 }, {
      y: -80,
      opacity: 0,
      immediateRender: false,
      stagger: 0.08,
      ease: "power1.in",
      scrollTrigger: {
        start: () => pin.end - window.innerHeight * EXIT,
        end: () => pin.end,
        scrub: true,
      },
    });
  });

  // velocity skew: content leans into fast scrolls, settles when you stop
  const skewSetter = gsap.quickSetter(".skew", "skewY", "deg");
  let skew = 0;
  let skewTarget = 0;
  lenis.on("scroll", ({ velocity }) => {
    skewTarget = gsap.utils.clamp(-1.5, 1.5, velocity * 0.03);
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
    duration: reducedMotion ? 0.01 : 0.7,
    ease: "power2.inOut",
    onUpdate: () => { countEl.textContent = String(Math.round(counter.v)).padStart(2, "0"); },
  })
    .to(preloader, {
      yPercent: -100,
      duration: reducedMotion ? 0.01 : 0.8,
      ease: "power4.inOut",
      onComplete: () => preloader.remove(),
    })
    .from(".hero-char", {
      yPercent: 120,
      rotateX: -90,
      stagger: 0.06,
      duration: 1,
      ease: "back.out(1.4)",
    }, "-=0.35")
    .from(".hero-eyebrow .line, .hero-sub .line", {
      y: 24,
      opacity: 0,
      stagger: 0.12,
      duration: 0.7,
    }, "-=0.6")
    .from(".nav, .hero-scroll", { opacity: 0, duration: 0.6 }, "-=0.4");
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
    { y: 90, rotation: i % 2 ? 1.5 : -1.5, scale: 0.95, opacity: 0 },
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

// index numbers fade up
gsap.utils.toArray(".section-index, .project-num").forEach((el) => {
  gsap.from(el, {
    y: 12,
    opacity: 0,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: revealAt(el),
  });
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

/* ---------- Car carousel ---------- */
// WebGL helix (src/helix.js); click the front photo to see it whole, uncropped
const carPhotos = Array.from({ length: 8 }, (_, i) => `/cars/car-${i + 1}.jpg`);
const carView = document.getElementById("carView");
const carCount = document.getElementById("carCount");
const helix = createHelix(document.getElementById("carHelix"), carPhotos, {
  // tighter than the original 0.8 / 0.79: cards keep their photo's narrower
  // shape here, so the default spacing leaves big gaps
  twist: 0.42,
  rise: 0.6,
  reduced: reducedMotion,
  onActive: (i) => { carCount.textContent = `${String(i + 1).padStart(2, "0")} / ${String(carPhotos.length).padStart(2, "0")}`; },
  onOpen: (i) => {
    carView.querySelector("img").src = carPhotos[i];
    carView.showModal();
    lenis?.stop();
  },
});
// shortcut: without WebGL2 the helix just hides; add a plain photo strip if that ever matters
if (!helix) document.querySelector(".helix").hidden = true;
// page scroll turns the helix while its section is pinned: the hold zone
// (pin minus the fly-out stretch) walks through every photo once
const carPin = shapePins.find((p) => p.trigger.id === "offscreen");
if (helix && carPin) {
  let last = 0;
  ScrollTrigger.create({
    start: () => carPin.start,
    end: () => carPin.end - window.innerHeight * EXIT,
    onUpdate: (self) => {
      helix.turn((self.progress - last) * (carPhotos.length - 1));
      last = self.progress;
    },
  });
}
carView.addEventListener("click", () => carView.close());
carView.addEventListener("close", () => lenis?.start());

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
