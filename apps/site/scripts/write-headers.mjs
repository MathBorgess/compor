import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (path.endsWith(".html")) files.push(path);
  }
  return files;
}

const hashes = new Set();
let beacon = false;

for (const file of walk("dist")) {
  const html = readFileSync(file, "utf8");
  if (html.includes("https://static.cloudflareinsights.com/beacon.min.js")) beacon = true;

  const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(jsonLd)) {
    const hash = createHash("sha256").update(match[1], "utf8").digest("base64");
    hashes.add(`'sha256-${hash}'`);
  }

  const unexpected = html.match(
    /<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g,
  );
  if (unexpected) {
    console.error(`Unexpected inline script in ${file}`);
    process.exit(1);
  }
}

const scriptSrc = ["'self'", ...hashes];
const connectSrc = ["'self'"];
if (beacon) {
  scriptSrc.push("https://static.cloudflareinsights.com/beacon.min.js");
  connectSrc.push("cloudflareinsights.com");
}

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  `connect-src ${connectSrc.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: ${csp}

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;

writeFileSync("dist/_headers", headers);
console.log(`Wrote dist/_headers with ${hashes.size} JSON-LD hash(es).`);
