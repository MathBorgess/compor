/** Local, experimental SVG composition; not a product editor. Never overwrites assets. */
import { readFile, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const assets = resolve(root, 'docs/evals/2026-10-29-phoenix-e2e/artifacts');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const text = (value, field, max) => {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`Campo inválido: ${field}`);
  return xml(value.trim());
};

export async function compose(manifestPath) {
  const raw = await readFile(manifestPath);
  if (raw.length > 16000) throw new Error('Manifesto excessivamente grande');
  const m = JSON.parse(raw.toString('utf8'));
  if (!m || Array.isArray(m) || typeof m !== 'object' || Object.keys(m).sort().join(',') !== ['base', 'base_sha256', 'rotulo_pessoal', 'rotulo_trabalho', 'subtitulo', 'titulo_linhas', 'versao'].sort().join(',')) throw new Error('Manifesto inválido');
  text(m.versao, 'versao', 80);
  if (m.base !== 'base-alternativa-grafica.png' || !/^[a-f0-9]{64}$/u.test(m.base_sha256)) throw new Error('Base ou hash inválido');
  if (!Array.isArray(m.titulo_linhas) || m.titulo_linhas.length < 1 || m.titulo_linhas.length > 3) throw new Error('Use de uma a três linhas no título');
  const title = m.titulo_linhas.map((line, i) => `<tspan x="105" dy="${i === 0 ? 0 : 85}">${text(line, 'titulo_linhas', 26)}</tspan>`).join('');
  const subtitle = text(m.subtitulo, 'subtitulo', 46), work = text(m.rotulo_trabalho, 'rotulo_trabalho', 22), personal = text(m.rotulo_pessoal, 'rotulo_pessoal', 22);
  const image = await readFile(resolve(assets, m.base));
  if (digest(image) !== m.base_sha256) throw new Error('O hash da base mudou; a composição foi bloqueada');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1122" height="1402" viewBox="0 0 1122 1402" role="img" aria-label="Peça experimental com texto editável"><image id="imagem-base" width="1122" height="1402" xlink:href="data:image/png;base64,${image.toString('base64')}"/><g id="texto-editavel" fill="#162a43" font-family="Georgia,serif"><text id="titulo" x="105" y="195" font-size="71" font-weight="700">${title}</text><text id="contexto" x="109" y="485" font-family="Arial,sans-serif" font-size="34" fill="#263b50">${subtitle}</text><g id="contas-editaveis"><rect x="65" y="1235" width="470" height="100" rx="18" fill="#f4f0e5" stroke="#162a43" stroke-width="3"/><rect x="590" y="1235" width="470" height="100" rx="18" fill="#f4f0e5" stroke="#162a43" stroke-width="3"/><path d="M100 1263h35 M100 1284h35 M100 1305h35 M625 1263h35 M625 1284h35 M625 1305h35" fill="none" stroke="#162a43" stroke-width="5" stroke-linecap="round"/><text id="rotulo-trabalho" x="155" y="1296" font-family="Arial,sans-serif" font-size="33" font-weight="700">${work}</text><text id="rotulo-pessoal" x="680" y="1296" font-family="Arial,sans-serif" font-size="33" font-weight="700">${personal}</text></g></g></svg>`;
  return { svg, base_sha256: digest(image), manifesto_sha256: digest(raw) };
}

async function run() {
  const [manifest, svgPath, pngPath, ...extra] = process.argv.slice(2);
  if (!manifest || !svgPath || extra.length || (pngPath && resolve(svgPath) === resolve(pngPath))) throw new Error('Uso: node compose-phoenix-creative.mjs manifesto.json saida.svg [previa.png]');
  const output = await compose(manifest);
  let png;
  if (pngPath) {
    // Optional renderer provided by the local bundled runtime; NODE_PATH may be required.
    let sharp;
    try { sharp = createRequire(import.meta.url)('sharp'); } catch { throw new Error('Para a prévia PNG, disponibilize sharp no NODE_PATH do runtime local'); }
    png = await sharp(Buffer.from(output.svg)).png().toBuffer();
  }
  const created = [];
  try {
    for (const [path, body] of [[svgPath, output.svg], ...(pngPath ? [[pngPath, png]] : [])]) {
      const file = await open(path, 'wx', 0o600);
      created.push(path);
      try { await file.writeFile(body); } finally { await file.close(); }
    }
  } catch (err) {
    for (const path of created) await unlink(path).catch(() => {});
    throw err;
  }
  console.log(JSON.stringify({ status: 'ok', svg: resolve(svgPath), png: pngPath ? resolve(pngPath) : null, base_sha256: output.base_sha256, manifesto_sha256: output.manifesto_sha256, review: 'Confira texto e recortes; esta é uma ferramenta local de experimento.' }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
