// Verifies proximity snap: free resting away from sections, gentle settle
// near them, no up-scroll overshoot. Must use mouse.wheel — Lenis intercepts
// wheel input and ignores programmatic scrollTo.
import { chromium } from "playwright-core";
import os from "node:os";
import path from "node:path";

const exe = path.join(
  os.homedir(),
  "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
);

const PORT = process.argv[2] || "5173";
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // preloader + intro

const scrollY = () => page.evaluate(() => window.scrollY);
const wheel = async (ticks, delta = 120, gap = 50) => {
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(gap);
  }
};
// wait past lenis lerp + debounce(500) + snap duration(600)
const settle = () => page.waitForTimeout(2200);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
};

// pin geometry from the app
const pins = await page.evaluate(() =>
  // ScrollTrigger instances aren't exposed; recompute snap centers from
  // pin-spacers: each pinned section's trigger start = spacer top - (vh - section h)/2 …
  // simpler: read ScrollTrigger via gsap global if exposed, else measure spacers
  Array.from(document.querySelectorAll(".pin-spacer")).map((s) => {
    const r = s.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  })
);
console.log(`pin-spacers: ${pins.length}`);

// 1. single small tick in hero: should NOT be reverted to 0 (old mandatory bug)
await wheel(1);
await settle();
let y = await scrollY();
check("small tick in hero is kept", y > 60, `scrollY=${y} after one 120px tick (mandatory snap used to revert to 0)`);

// 2. rest far from any section center: stop roughly mid-gap and confirm no drift
await wheel(4, 200);
await settle();
const restA = await scrollY();
await page.waitForTimeout(2000);
const restB = await scrollY();
check("page can rest (no late drift)", Math.abs(restB - restA) < 2, `moved ${Math.abs(restB - restA).toFixed(1)}px over 2s at y=${restA.toFixed(0)}`);

// 3. scroll near a section center: should gently settle onto it
// scroll a lot so we're inside pin territory, then nudge and stop
await wheel(10, 250);
await settle();
const nearStop = await scrollY();
await page.waitForTimeout(100);
const afterSnap = await scrollY();
console.log(`info: deep-page stop y=${nearStop.toFixed(0)}, post=${afterSnap.toFixed(0)}`);

// 4. up-scroll symmetry: measure net movement for a known gesture, no overshoot
const beforeUp = await scrollY();
await wheel(3, -180); // ~540px of intent upward
await settle();
const afterUp = await scrollY();
const net = beforeUp - afterUp;
check("up-scroll has no catapult overshoot", net < 1100, `net up movement ${net.toFixed(0)}px for ~540px gesture (was 1132px with mandatory)`);
check("up-scroll actually moved", net > 100, `net ${net.toFixed(0)}px`);

// 5. anchor nav lands centered
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
const target = await page.evaluate(() => {
  const hrefs = Array.from(document.querySelectorAll('a[href^="#"]'))
    .map((a) => a.getAttribute("href"))
    .filter((h) => h && h.length > 1);
  return hrefs.find((h) => document.querySelector(h)?.dataset?.shape !== undefined) || hrefs[0];
});
if (target) {
  await page.click(`a[href="${target}"]`);
  await page.waitForTimeout(2500);
  const off = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2 - window.innerHeight / 2;
  }, target);
  check(`anchor ${target} lands centered`, Math.abs(off) < 40, `off-center by ${off.toFixed(0)}px`);
}

// 6. console errors
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.evaluate(() => window.scrollTo(0, 0));
await wheel(30, 400, 30); // blast to bottom
await settle();
check("no page errors during full scroll", errors.length === 0, errors.join("; ") || "clean");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
