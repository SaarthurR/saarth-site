// One-shot hero check: boots vite itself (no persistent server needed),
// screenshots the hero after the intro + slot reel resolve, and asserts the
// new "Hi, I'm Saarth." copy landed everywhere it should.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright-core";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd(); // run from the project root
const PORT = 5179;
// try playwright's Chrome-for-Testing first, then system Chrome
const candidates = [
  path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const exe = candidates.find((p) => fs.existsSync(p))

// reuse an already-running dev server (e.g. scripts/dev-daemon.mjs) if present
let vite = null;
const alreadyUp = await fetch(`http://localhost:${PORT}`).then((r) => r.ok).catch(() => false);
if (!alreadyUp) {
  vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
let viteOut = "";
vite?.stdout?.on("data", (d) => (viteOut += d));
vite?.stderr?.on("data", (d) => (viteOut += d));

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}`);
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error("vite never came up:\n" + viteOut);
};

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.getElementById("preloader"), { timeout: 15000 });
  await page.waitForTimeout(400); // let the intro settle

  const title = await page.title();
  const heroText = await page.evaluate(() => {
    // space between words is the flex gap, so join per-word
    return Array.from(document.querySelectorAll(".hero-row"))
      .map((row) =>
        Array.from(row.querySelectorAll(".hero-word"))
          .map((w) => Array.from(w.querySelectorAll(".hero-char")).map((c) => c.textContent).join(""))
          .join(" ")
      )
      .join(" ");
  });
  const swapVisible = await page.evaluate(() => {
    const row = document.querySelector(".hero-row-swap");
    const words = Array.from(row.querySelectorAll(".hero-word"))
      .map((w) => Array.from(w.querySelectorAll(".hero-char")).map((c) => c.textContent).join(""));
    const reelGone = !row.querySelector(".hero-reel");
    return { words, reelGone };
  });
  const subText = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".hero-sub .line")).map((l) => l.textContent).join(" ")
  );
  const projectsHead = await page.evaluate(() =>
    document.querySelector("#projects .section-title").textContent.replace(/\s+/g, " ")
  );
  const aboutText = await page.evaluate(() =>
    document.getElementById("aboutText").textContent.trim()
  );
  const ariaLabel = await page.evaluate(() =>
    document.querySelector(".hero-title").getAttribute("aria-label")
  );

  await page.screenshot({ path: "shots/hero-hi-im-saarth.png" });

  const checks = [
    ["page <title>", title === "Saarth Ranka — 14-year-old builder", title],
    ["h1 reads 'Hi, I'm Saarth.'", heroText === "Hi, I'm Saarth.", heroText],
    ["aria-label", ariaLabel === "Hi, I'm Saarth", ariaLabel],
    ["swap row = [Saarth.], no slot reel", swapVisible.reelGone && JSON.stringify(swapVisible.words) === JSON.stringify(["Saarth."]), JSON.stringify(swapVisible)],
    ["sub copy", subText === "I build websites, trading systems, and tools.", subText],
    ["projects header", projectsHead === "What I've built", projectsHead],
    ["about starts clean", aboutText.startsWith("I'm Saarth. I'm 14, and I'd rather build than talk."), aboutText.slice(0, 60)],
  ];
  let failed = 0;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
    if (!pass) failed++;
  }
  console.log("page errors:", errors.length ? errors.join(" | ") : "none");
  if (errors.length) failed++;
  await browser.close();
  process.exit(failed ? 1 : 0);
} finally {
  vite?.kill();
}
