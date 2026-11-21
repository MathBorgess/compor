import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const html = readFileSync("dist/index.html", "utf8");
const files = walk("dist");
const text = files
  .filter((file) => /\.(html|css|js|svg|txt)$/.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const required = [
  "O post de divulgação do seu curso, pronto. Sem inventar nada sobre a sua oferta.",
  "Você conta o que está vendendo. O Compor entrega o post pronto, com o texto na arte, e a legenda para colar.",
  "Criar meu post",
  "Conte o que você está vendendo",
  "Seu post, com os seus dados",
  "Confira antes de baixar",
  "Baixar o post",
  "Copiar a legenda",
  "Gerador genérico cria do zero. O Compor usa só o que você contou, e você edita tudo o que aparece no post.",
  "Para o infoprodutor que lança sozinho e não quer reescrever o preço e a data a cada lançamento.",
  "Preciso de chave de IA?",
  "Na fase de teste, não.",
  "Quanto custa?",
  "Por enquanto, o acesso é por convite durante o teste.",
  "O Compor inventa informação?",
  "Não. Ele só usa o que você escreveu.",
  "Entre na lista e seja dos primeiros a testar.",
  "Exemplo ilustrativo",
  "application/ld+json",
  "SoftwareApplication",
  "Organization",
  "og:image",
  "mailto:we@mathai.com.br",
];

for (const snippet of required) {
  const haystack = snippet.startsWith("aspect-ratio") || snippet.includes("_")
    ? text
    : html;
  if (!haystack.includes(snippet)) fail(`Missing: ${snippet}`);
}

const forbidden = [
  /\bdesigner\b/i,
  /\bcanva\b/i,
  /crie com ia/i,
  /em segundos/i,
  /em minutos/i,
  /sem depender/i,
  /depoimento/i,
  /linear-gradient/i,
  /radial-gradient/i,
  /gradient\s*\(/i,
  /\bpurple\b/i,
  /#7c3aed/i,
  /#8b5cf6/i,
  /phc_[a-z0-9]+/i,
  /posthog/i,
  /ola@/i,
];

for (const pattern of forbidden) {
  if (pattern.test(text)) fail(`Forbidden pattern ${pattern} matched the build`);
}

if (html.includes("<style")) fail("Inline style tag found; CSP expects external CSS");
if (!html.includes('rel="stylesheet"')) fail("Stylesheet link missing");

const css = files.filter((file) => file.endsWith(".css")).map((file) => readFileSync(file, "utf8")).join("\n");
for (const color of ["#f4f0e5", "#f6d550", "#123eab", "#2c2d2f"]) {
  if (!css.toLowerCase().includes(color)) fail(`Brand color ${color} missing from CSS`);
}
if (!/aspect-ratio:\s*1080\s*\/\s*1350/.test(css)) {
  fail("Example post is missing the 1080/1350 aspect ratio");
}

if (!files.some((file) => file.endsWith("404.html"))) fail("404.html missing");
if (!files.some((file) => file.endsWith("og.png"))) fail("og.png missing");
if (!files.some((file) => file.endsWith("sitemap-index.xml"))) fail("sitemap-index.xml missing");

const robots = readFileSync("dist/robots.txt", "utf8");
if (!robots.includes("https://compor.mathai.com.br/sitemap-index.xml")) {
  fail("robots.txt is missing the sitemap URL");
}

const headers = readFileSync("dist/_headers", "utf8");
const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!jsonLd) fail("JSON-LD script missing");
else {
  const hash = createHash("sha256").update(jsonLd[1], "utf8").digest("base64");
  if (!headers.includes(`'sha256-${hash}'`)) fail("CSP hash does not match JSON-LD");
}

const token = (process.env.CF_WEB_ANALYTICS_TOKEN ?? "").trim();
const beacon = "https://static.cloudflareinsights.com/beacon.min.js";
if (token) {
  if (!html.includes(beacon)) fail("CF_WEB_ANALYTICS_TOKEN is set but the beacon is missing");
  if (!html.includes(token)) fail("Beacon markup is missing the build-time token");
  if (!headers.includes(beacon)) fail("CSP is missing the Web Analytics script");
  if (!headers.includes("cloudflareinsights.com")) fail("CSP is missing the Web Analytics connect host");
} else if (html.includes("cloudflareinsights.com") || headers.includes("cloudflareinsights.com")) {
  fail("Web Analytics beacon rendered without CF_WEB_ANALYTICS_TOKEN");
}

const site = readFileSync("src/data/site.ts", "utf8");
if (!site.includes("TODO(owner)") || !site.includes("TODO(waitlist)")) {
  fail("CTA or waitlist TODO missing from site.ts");
}
if (!site.includes('CTA_DESTINATION = "waitlist"')) fail("CTA destination constant missing");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("dist checks passed");
