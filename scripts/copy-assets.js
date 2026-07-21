"use strict";

// tsc only emits JS. The renderer's static assets (HTML + CSS) need to land in
// dist/ next to the compiled app.js so Electron can loadFile() them.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const srcRenderer = path.join(root, "src", "renderer");
const outRenderer = path.join(root, "dist", "renderer");

fs.mkdirSync(outRenderer, { recursive: true });

for (const file of ["index.html", "styles.css"]) {
  fs.copyFileSync(path.join(srcRenderer, file), path.join(outRenderer, file));
}

console.log("copied renderer assets → dist/renderer");
