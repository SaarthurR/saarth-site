const res = await fetch("http://localhost:5179");
const html = await res.text();
console.log("status:", res.status);
console.log("hero present:", html.includes("hero-title"));
console.log("main.js linked:", html.includes("/src/main.js"));
