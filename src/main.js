import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { createScene } from "./scene.js";
import { playBol } from "./tabla.js";

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Three.js background ---------- */
const sceneApi = createScene(document.getElementById("webgl"), { reducedMotion });

/* ---------- Smooth scroll (Lenis + GSAP) ---------- */
let lenis = null;
if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// drive the particle sphere morph with overall page progress
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => sceneApi.setScroll(self.progress),
});

// the shader already dims the dust; this is just a gentle extra fade for body text
gsap.to("#webgl", {
  opacity: 0.55,
  ease: "none",
  scrollTrigger: { trigger: "#projects", start: "top 75%", end: "top 25%", scrub: true },
});
gsap.to("#webgl", {
  opacity: 1,
  ease: "none",
  scrollTrigger: { trigger: "#contact", start: "top 90%", end: "top 40%", scrub: true },
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
    scrollTrigger: { trigger: el, start: "top 88%" },
  });
});

gsap.utils.toArray(".reveal-block").forEach((el) => {
  gsap.from(el, {
    y: 40,
    opacity: 0,
    duration: 1,
    ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 85%" },
  });
});

gsap.utils.toArray(".project").forEach((el, i) => {
  gsap.from(el, {
    y: 60,
    opacity: 0,
    duration: 0.9,
    delay: (i % 2) * 0.08,
    ease: "power3.out",
    scrollTrigger: { trigger: el, start: "top 90%" },
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
    scrollTrigger: { trigger: el, start: "top 90%" },
    onUpdate: () => { el.textContent = obj.v.toFixed(decimals); },
  });
});

/* ---------- Marquee ---------- */
if (!reducedMotion) {
  const track = document.getElementById("marqueeTrack");
  gsap.to(track, { xPercent: -50, ease: "none", duration: 22, repeat: -1 });
}

/* ---------- Custom cursor ---------- */
const dot = document.getElementById("cursorDot");
const ring = document.getElementById("cursorRing");
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { ...pos };
  window.addEventListener("pointermove", (e) => { pos.x = e.clientX; pos.y = e.clientY; });
  gsap.ticker.add(() => {
    ringPos.x += (pos.x - ringPos.x) * 0.18;
    ringPos.y += (pos.y - ringPos.y) * 0.18;
    dot.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
    ring.style.transform = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%,-50%)`;
  });
  document.querySelectorAll("[data-cursor]").forEach((el) => {
    const mode = el.dataset.cursor;
    el.addEventListener("pointerenter", () => ring.classList.add(`is-${mode}`));
    el.addEventListener("pointerleave", () => ring.classList.remove(`is-${mode}`));
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

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
  const bol = padByKey[e.key];
  if (bol) {
    const pad = document.querySelector(`.pad[data-bol="${bol}"]`);
    if (pad) hitPad(pad);
  }
});

/* ---------- Anchor links work with Lenis ---------- */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (target && lenis) {
      e.preventDefault();
      lenis.scrollTo(target, { offset: -40 });
    }
  });
});
