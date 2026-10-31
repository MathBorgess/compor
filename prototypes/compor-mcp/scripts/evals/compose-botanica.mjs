/** Composição local de experimento, fora do MCP. Uso: node compose-botanica.mjs base.png texto.json saída.svg saída.png */
import { readFile, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const [basePath, manifestPath, svgPath, pngPath, ...extra] = process.argv.slice(2);
if (!basePath || !manifestPath || !svgPath || !pngPath || extra.length || new Set([basePath, manifestPath, svgPath, pngPath].map(p => resolve(p))).size !== 4) {
  throw new Error('Uso: node compose-botanica.mjs base.png texto.json saída.svg saída.png');
}
const sharp = createRequire(import.meta.url)('sharp');
const hash = b => createHash('sha256').update(b).digest('hex');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const field = (v, name, limit) => {
  if (typeof v !== 'string' || !v.trim() || [...v].length > limit || /[\u0000-\u001f\u007f]/u.test(v)) throw new Error(`Campo inválido: ${name}`);
  return escape(v.trim());
};
const raw = await readFile(manifestPath);
if (raw.length > 12000) throw new Error('Manifesto excessivamente grande');
const data = JSON.parse(raw);
if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Manifesto inválido');
const hasBrand = Object.hasOwn(data, 'marca');
const hasStyle = Object.hasOwn(data, 'estilo');
if (hasStyle && (data.estilo !== 'v4' || !hasBrand)) throw new Error('Estilo inválido');
const expected = ['titulo_linhas', 'subtitulo', 'inicio', 'duracao', 'exercicios', 'cta', 'apoio', ...(hasBrand ? ['marca'] : []), ...(hasStyle ? ['estilo'] : [])];
if (Object.keys(data).sort().join(',') !== expected.sort().join(',')) throw new Error('Manifesto inválido');
if (!Array.isArray(data.titulo_linhas) || data.titulo_linhas.length !== 2) throw new Error('O título precisa ter exatamente duas linhas');
const title = data.titulo_linhas.map((v, i) => `<text id="titulo-${i + 1}" x="100" y="${475 + i * 104}" font-size="${hasStyle ? '103' : '97'}" font-weight="${hasBrand ? '400' : '700'}"${hasStyle && i === 1 ? ' fill="#994b3c"' : ''}>${field(v, 'titulo_linhas', 18)}</text>`).join('');
const subtitle = field(data.subtitulo, 'subtitulo', 30);
const start = field(data.inicio, 'inicio', 30);
const duration = field(data.duracao, 'duracao', 36);
const exercises = field(data.exercicios, 'exercicios', 30);
const cta = field(data.cta, 'cta', 25);
const support = field(data.apoio, 'apoio', 25);
const brand = hasBrand ? `<text id="marca" x="103" y="356" font-size="${hasStyle ? '48' : '39'}">${field(data.marca, 'marca', 28)}</text>` : '';
const ctaBackground = hasStyle ? '<rect x="86" y="928" width="500" height="70" rx="15" fill="#dce4cc" fill-opacity="0.85"/>' : '';
const base = await readFile(basePath);
const metadata = await sharp(base).metadata();
if (metadata.format !== 'png' || metadata.width !== 1122 || metadata.height !== 1402) throw new Error('A base deve ser PNG de 1122 × 1402 px');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1122" height="1402" viewBox="0 0 1122 1402" role="img" aria-label="Peça de curso botânico com textos editáveis"><image id="base" width="1122" height="1402" xlink:href="data:image/png;base64,${base.toString('base64')}"/><g id="texto-editavel" fill="#344638" font-family="Georgia,serif">${brand}${title}<text id="subtitulo" x="103" y="666" font-family="${hasStyle ? 'Georgia,serif' : 'Arial,sans-serif'}" font-size="47" font-weight="${hasBrand ? '400' : '700'}">${subtitle}</text><text id="inicio" x="103" y="746" font-family="Arial,sans-serif" font-size="43">${start}</text><text id="duracao" x="103" y="807" font-family="Arial,sans-serif" font-size="43">${duration}</text><text id="exercicios" x="103" y="868" font-family="Arial,sans-serif" font-size="43">${exercises}</text>${ctaBackground}<text id="cta" x="103" y="975" font-family="Arial,sans-serif" font-size="49" font-weight="${hasBrand ? '400' : '700'}">${cta}</text><text id="apoio" x="103" y="1039" font-family="Arial,sans-serif" font-size="43">${support}</text></g></svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const created = [];
try {
  for (const [path, body] of [[svgPath, svg], [pngPath, png]]) {
    const out = await open(path, 'wx', 0o600);
    created.push(path);
    try { await out.writeFile(body); } finally { await out.close(); }
  }
} catch (err) {
  for (const path of created) await unlink(path).catch(() => {});
  throw err;
}
console.log(JSON.stringify({ svg: resolve(svgPath), png: resolve(pngPath), base_sha256: hash(base), manifesto_sha256: hash(raw), nota: 'Confira o texto e os recortes: limites de caracteres não garantem que caibam no layout.' }));
