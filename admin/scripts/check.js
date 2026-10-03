#!/usr/bin/env node
/**
 * `npm run check` — quick safety net before pushing (E8):
 *   1. syntax-checks every JavaScript file (admin + public /js)
 *   2. flags inline onclick=/onerror=… and inline <script> in public templates
 *      (they would block a strict Content-Security-Policy — E9)
 * Then run `npm test` for the behaviour tests.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ADMIN = path.join(__dirname, "..");
const ROOTS = ["src", "scripts", "test", "../js"].map((d) => path.join(ADMIN, d));

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

let failed = 0;
const files = ROOTS.flatMap((r) => walk(r, ".js"));
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (err) {
    failed++;
    console.error(`✗ syntax error in ${path.relative(ADMIN, f)}\n${String(err.stderr || err.message).trim()}\n`);
  }
}

// Inline handlers in what we send to visitors (public templates, pages, public JS).
const publicSources = [
  ...walk(path.join(ADMIN, "src", "ssr"), ".js"),
  ...walk(path.join(ADMIN, "pages"), ".html"),
  ...walk(path.join(ADMIN, "..", "js"), ".js"),
];
const INLINE = /<[a-z][^>]*\son(click|change|submit|input|load|error|keydown|keyup|mouseover|focus|blur)\s*=/i;
for (const f of publicSources) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (INLINE.test(line) || /<script>\s*$/.test(line.trim()) || /<script>[^<]/.test(line)) {
      // generator.js only mentions <script> in comments/regexes for tracking snippets
      if (/^\s*(\*|\/\/)/.test(line) || /\.replace\(|match\(/.test(line)) return;
      failed++;
      console.error(`✗ inline code in ${path.relative(ADMIN, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
}

if (failed) {
  console.error(`\n${failed} problem(s) found.`);
  process.exit(1);
}
console.log(`✓ ${files.length} JS files OK, no inline handlers in public templates.`);
