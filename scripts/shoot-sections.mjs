// Screenshots every pinned section (centered via anchor-style scroll) plus
// hero and mobile nav, for visual review after layout/shader changes.
import { chromium } from "playwright-core";
import os from "node:os";
import path from "node:path";
const exe = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

await page.screenshot({ path: "shots/v2-hero.png" });

// wheel-scroll down section by section; pause long enough for snap to settle
const ids = ["projects", "physics", "ascenta", "trading", "crm", "now", "tabla", "contact"];
for (const id of ids) {
  // scroll until this section is roughly centered
  for (let i = 0; i < 120; i++) {
    const off = await page.evaluate((sel) => {
      const r = document.getElementById(sel).getBoundingClientRect();
      return r.top + r.height / 2 - innerHeight / 2;
    }, id);
    if (off < 30) break;
    await page.mouse.wheel(0, Math.min(280, Math.max(80, off / 3)));
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(2300); // let snap + morph settle
  await page.screenshot({ path: `shots/v2-${id}.png` });
}

// mobile pass: hero + nav
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mob.goto("http://localhost:5173", { waitUntil: "networkidle" });
await mob.waitForTimeout(3000);
await mob.screenshot({ path: "shots/v2-mobile-hero.png" });
console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
