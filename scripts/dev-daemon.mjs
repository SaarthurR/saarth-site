// Boots vite fully detached (new process group, unref'd) so the dev server
// keeps running after this script exits. Safe to re-run: kills any existing
// vite on the port first.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";

const ROOT = process.cwd(); // run from the project root
const PORT = process.argv[2] || "5179";

try { execSync(`pkill -f "vite --port ${PORT}"`); } catch {}

const child = spawn("npx", ["vite", "--port", PORT, "--strictPort"], {
  cwd: ROOT,
  detached: true,
  stdio: "ignore",
});
child.unref();

// poll until the server answers
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://localhost:${PORT}`);
    if (r.ok) {
      console.log(`dev server up at http://localhost:${PORT}`);
      process.exit(0);
    }
  } catch {}
  await new Promise((res) => setTimeout(res, 250));
}
console.log("server did not come up in time");
process.exit(1);
