import { chromium } from "playwright-core";
import os from "node:os";
import path from "node:path";

const exe = path.join(
  os.homedir(),
  "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
);

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERROR:", m.text()); });
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

await page.goto("http://localhost:5179", { waitUntil: "networkidle" });
await page.waitForTimeout(3500); // let preloader + intro finish
await page.screenshot({ path: "shots/hero.png" });

const sections = ["projects", "physics", "ascenta", "trading", "crm", "now", "tabla", "contact"];
for (const id of sections) {
  await page.evaluate((sel) => {
    document.getElementById(sel).scrollIntoView({ block: "center", behavior: "instant" });
  }, id);
  await page.waitForTimeout(2200); // let the shape morph settle
  await page.screenshot({ path: `shots/${id}.png` });
}

// mobile viewport check
const mob = await browser.newPage({ viewport: { width: 375, height: 812 } });
await mob.goto("http://localhost:5179", { waitUntil: "networkidle" });
await mob.waitForTimeout(3000);
await mob.screenshot({ path: "shots/mobile.png" });

await browser.close();
console.log("done");
