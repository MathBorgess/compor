import { demonstrationDiagrams } from './plan.mjs';
import { usesDarkSurface } from './visuals.mjs';

const SYMBOLS = {
  flow: '<path d="M96 160h408m-48-44 48 44-48 44"/><circle cx="96" cy="160" r="42"/><circle cx="294" cy="160" r="40"/>',
  balance: '<path d="M304 82v160m-96 0h192M110 118h388M155 118l-57 98h114zM453 118l-57 98h114z"/>',
  steps: '<path d="M92 237h128v-63h128v-63h128"/><circle cx="92" cy="237" r="18"/><circle cx="476" cy="111" r="28"/>',
  focus: '<circle cx="304" cy="160" r="102"/><circle cx="304" cy="160" r="54"/><path d="M304 34v58m0 136v58M178 160h58m136 0h58"/>',
};

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escape(value) {
  return value.replace(/[&<>"']/g, character => ESCAPE[character]);
}

function makeHeadline({ headline, accentPhrase }) {
  if (!accentPhrase) return escape(headline);
  const start = headline.indexOf(accentPhrase);
  const end = start + accentPhrase.length;
  return escape(headline.slice(0, start)) + '<em data-ink>' + escape(accentPhrase) + '</em>' + escape(headline.slice(end));
}

function diagramText(value, { x = 210, y, size, width, opacity = 1 }) {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="700" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="var(--fg)" opacity="${opacity}">${escape(value)}</text>`;
}

function comparisonExample(type, sample, improved) {
  if (type === 'type_scale') {
    const scale = improved ? 2 : 1;
    const width = Math.min(176, sample.length * 16);
    return diagramText(sample, { y: 96, size: 32 * scale, width: width * scale });
  }
  const width = Math.min(352, sample.length * 27);
  return diagramText(sample, { y: 96, size: 52, width, opacity: improved ? 1 : 0.3 });
}

function hierarchyExample(items, improved) {
  const [primary, ...secondary] = items;
  const tile = (label, { x, y, width, height, size, textWidth, prominent = false }) => {
    const outline = prominent ? 'var(--ink)' : 'var(--fg)';
    const text = diagramText(label, { x: x + width / 2, y: y + height / 2, size, width: Math.min(textWidth, label.length * size * 0.58) });
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="11" fill="var(--bg)" stroke="${outline}" stroke-width="${prominent ? 4 : 2}" stroke-opacity="${prominent ? 1 : 0.3}"/>${text}`;
  };
  if (!improved) {
    return items.map((label, index) => tile(label, { x: 14 + index * 134, y: 52, width: 124, height: 88, size: 32, textWidth: 106 })).join('');
  }
  return tile(primary, { x: 14, y: 14, width: 392, height: 99, size: 56, textWidth: 345, prominent: true }) +
    secondary.map((label, index) => tile(label, { x: 14 + index * 203, y: 126, width: 189, height: 51, size: 32, textWidth: 160 })).join('');
}

function demonstrationSample(type, index, { items, sample }) {
  if (type === 'category_split' || type === 'orientation') {
    const value = type === 'category_split' ? items[index] : sample;
    const rotated = type === 'orientation' && index === 1 ? ' rotated' : '';
    return `<div class="diagram-sample-panel"><div class="diagram-sample${rotated}" data-region="diagram-sample">${escape(value)}</div></div>`;
  }
  const improved = index === 1;
  const drawing = type === 'hierarchy' ? hierarchyExample(items, improved) : comparisonExample(type, sample, improved);
  return `<svg viewBox="0 0 420 192" aria-hidden="true"><rect x="1.5" y="1.5" width="417" height="189" rx="20" fill="var(--bg)" stroke="var(--ink)" stroke-width="3"/>${drawing}</svg>`;
}

function demonstration({ type, labels, sample, items }) {
  const panels = labels.map((label, index) => `<figure class="diagram-panel">${demonstrationSample(type, index, { items, sample })}<figcaption data-region="diagram-label">${escape(label)}</figcaption></figure>`);
  return `<div class="media diagram diagram-demonstration" data-demonstration="${type}">${panels.join('')}</div>`;
}

function spacingPlate(label, dx, dy) {
  const positions = [[-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy]];
  const neighbors = positions.map(([x, y], index) => {
    const shape = index % 2 === 0 ? '<circle r="17"/>' : '<rect x="-16" y="-16" width="32" height="32" rx="6"/>';
    return `<g class="spacing-neighbor" transform="translate(${210 + x} ${96 + y})">${shape}</g>`;
  }).join('');
  return `<figure class="diagram-panel">
    <svg viewBox="0 0 420 192" aria-hidden="true">
      <rect class="spacing-frame" x="1.5" y="1.5" width="417" height="189" rx="20"/>
      <path class="spacing-focus" d="M210 53l43 43-43 43-43-43z"/>
      <g class="spacing-context">${neighbors}</g>
    </svg>
    <figcaption data-region="diagram-label">${label}</figcaption>
  </figure>`;
}

function spacingComparison(alt) {
  return `<div class="media diagram diagram-demonstration spacing-proof" role="img" aria-label="${escape(alt)}">` +
    spacingPlate('Vizinhos próximos', 53, 32) + spacingPlate('Vizinhos afastados', 104, 53) + '</div>';
}

function readabilityMatrix(alt) {
  const label = (copy, kind = '') => `<span class="matrix-label ${kind}" data-region="diagram-label">${copy}</span>`;
  const panel = (copy, kind = '') => `<div class="matrix-panel ${kind}"${kind === 'low-contrast' ? '' : ' data-region="diagram-proof"'}>${copy}</div>`;
  const sample = 'Oferta';
  const hierarchy = '<strong>Oferta</strong><span>Detalhes</span>';
  return `<div class="media readability-matrix" role="img" aria-label="${escape(alt)}">` +
    label('Antes', 'before') + label('Com ajuste', 'after') +
    label('Tamanho') + panel(sample, 'small') + panel(sample, 'large') +
    label('Contraste') + panel(sample, 'low-contrast') + panel(sample) +
    label('Hierarquia') + panel(hierarchy, 'equal-weight') + panel(hierarchy, 'primary-weight') + '</div>';
}

function media(slide) {
  if (slide.art) return '<div class="media"><img src="' + escape(slide.art) + '" alt=""></div>';
  if (!slide.diagram) return '';
  if (slide.diagram.type === 'spacing') return spacingComparison(slide.alt);
  if (slide.diagram.type === 'readability_matrix') return readabilityMatrix(slide.alt);
  if (demonstrationDiagrams.includes(slide.diagram.type)) return demonstration(slide.diagram);
  const { type, labels = [] } = typeof slide.diagram === 'string' ? { type: slide.diagram } : slide.diagram;
  const diagram = '<svg viewBox="0 0 608 300" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">' +
    SYMBOLS[type] + '</g></svg>';
  const labelList = labels.length ? '<ul class="diagram-labels" data-region="diagram-label">' +
    labels.map(label => '<li>' + escape(label) + '</li>').join('') + '</ul>' : '';
  return '<div class="media diagram">' + diagram + labelList + '</div>';
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:1080px;height:1350px}
main{--diagram-height:360px;position:relative;isolation:isolate;display:grid;grid-template-rows:minmax(0,1fr) auto;width:1080px;height:1350px;overflow:hidden;background:var(--bg);color:var(--fg);padding:156px 88px 120px;font-family:DM Sans,Arial,sans-serif}
.content{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;gap:30px;align-self:stretch;min-height:0}
main h1,main p,main ul{margin:0}
h1{font-size:var(--head,86px);line-height:1.14;font-weight:700;text-wrap:balance;white-space:pre-line;overflow-wrap:anywhere}
.cover h1{font-size:var(--head,116px);line-height:1.10}
em{font-style:normal;color:var(--ink)}
.body{font-size:var(--body,46px);line-height:1.42;white-space:pre-line;overflow-wrap:anywhere}
.kicker{font-size:31px;line-height:1.22;font-weight:700;letter-spacing:.075em;text-transform:uppercase;width:fit-content}
.source{position:absolute;left:88px;bottom:120px;max-width:904px;font-size:24px;line-height:1.30;z-index:2;white-space:nowrap}
.figure{font-size:var(--figure,188px);line-height:1.03;font-weight:700;letter-spacing:-.06em;font-variant-numeric:tabular-nums;color:var(--ink)}
.media{width:100%;height:100%;min-height:0;overflow:hidden;display:block}
.media img{width:100%;height:100%;object-fit:cover;display:block}
.diagram{color:var(--ink);background:var(--bg);height:var(--diagram-height);display:flex;flex-direction:column;justify-content:center;overflow:visible}
.diagram svg{width:100%;height:auto;min-height:0;max-height:300px}
.diagram ul{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;padding:0;list-style:none;font-size:32px;line-height:1.23;color:var(--fg);text-align:center}
.diagram ul li{max-width:100%;overflow-wrap:anywhere}
.diagram-demonstration{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-content:center;align-items:start}
.diagram-panel{display:grid;gap:12px;min-width:0;margin:0}
.diagram-panel svg{display:block}
.diagram-panel figcaption{padding:0 8px;color:var(--fg);font-size:32px;line-height:1.23;text-align:center;overflow-wrap:anywhere}
.spacing-proof figcaption{font-size:36px}
.spacing-frame{fill:var(--bg);stroke:var(--ink);stroke-width:2;stroke-opacity:.64}
.spacing-focus{fill:var(--ink)}
.spacing-context{fill:none;stroke:color-mix(in srgb,var(--fg) 64%,var(--bg));stroke-width:4}
.diagram-sample-panel{aspect-ratio:420/192;display:grid;align-items:center;min-width:0;padding:16px;border:3px solid color-mix(in srgb,var(--fg) 45%,var(--bg));border-radius:20px}
.diagram-sample{min-width:0;color:var(--fg);font-size:38px;line-height:1.22;font-weight:700;text-align:center;overflow-wrap:anywhere}
.diagram-sample.rotated{transform:rotate(180deg)}
.hero_bleed .diagram ul{margin-top:12px}
.split_vertical .diagram ul{flex-direction:column}
.hero_bleed .media{position:absolute;z-index:-2;inset:0}
.hero_bleed.has-art::before{position:absolute;z-index:-1;inset:0;content:"";background:linear-gradient(180deg,transparent 3%,var(--scrim-low) 27%,var(--scrim-high) 46%,var(--bg) 91%)}
.hero_bleed .content{justify-content:end;padding-bottom:88px}
.split_horizontal{--media-row:510px;grid-template-rows:minmax(0,var(--media-row)) minmax(0,1fr);gap:48px}
.split_horizontal:not(.cover):has(>.diagram:not(.diagram-demonstration)){--media-row:var(--diagram-height)}
.split_horizontal:has(>.diagram-demonstration){--media-row:360px;grid-template-rows:auto minmax(0,1fr)}
.split_horizontal .content{justify-content:start}
.split_vertical{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:42px}
.split_vertical .content{grid-column:1;grid-row:1}
.split_vertical .media{grid-column:2;grid-row:1;height:760px;align-self:center}
.split_vertical h1,.comparison_dual h1{font-size:var(--head,72px)}
.framed_plate{--media-row:460px;grid-template-rows:minmax(0,var(--media-row)) minmax(0,1fr);gap:44px}
.framed_plate .media{border:4px solid var(--ink);padding:12px}
.framed_plate .content{justify-content:start}
.stat_monument .content{border-top:6px solid var(--ink);margin-top:36px}
.stat_monument .media{height:244px;width:46%;position:absolute;right:88px;bottom:200px;opacity:.18}
.svg_diagram{--media-row:380px;grid-template-rows:minmax(0,var(--media-row)) minmax(0,1fr);gap:40px}
.svg_diagram .content{justify-content:start}
.comparison_dual{--media-row:400px;grid-template-rows:minmax(0,var(--media-row)) minmax(0,1fr);gap:38px}
.comparison_dual .content{justify-content:start}
.bento_grid .content{justify-content:start}
.bento_grid .media{position:absolute;width:220px;height:180px;right:88px;bottom:180px}
.artifact_proof{grid-template-rows:minmax(0,1fr) minmax(0,400px);gap:40px}
.artifact_proof .media{grid-row:2;object-fit:contain}
.artifact_proof .media img{object-fit:contain}
.artifact_proof .content{grid-row:1}
.typo_breather .content{border-left:10px solid var(--ink);padding-left:42px}
.native_serial .content{justify-content:start;padding-top:144px}
.native_serial .media{position:absolute;width:208px;height:180px;right:88px;bottom:174px}
.native_serial:has(>.readability-matrix){grid-template-rows:max-content minmax(min-content,1fr);row-gap:24px;padding-bottom:188px}
.native_serial:has(>.readability-matrix):not(.cover){--head:74px;--body:44px}
.native_serial:has(>.readability-matrix)>.content{grid-row:1}
.native_serial>.readability-matrix{position:static;grid-row:2;align-self:end;width:100%;height:min-content;display:grid;gap:11px;overflow:visible;
  grid-template-columns:210px repeat(2,minmax(0,1fr));grid-template-rows:auto repeat(3,92px)}
.matrix-label{font-weight:700;font-size:37px;line-height:1.2;align-self:center}
.matrix-label.before{grid-column:2;text-align:center}
.matrix-label.after{grid-column:3;text-align:center}
.matrix-panel{min-width:0;border:3px solid var(--ink);border-radius:16px;color:var(--fg);font-size:48px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:14px}
.matrix-panel.small{font-size:30px}
.matrix-panel.large{font-size:54px}
.matrix-panel.low-contrast{color:color-mix(in srgb,var(--fg) 31%,var(--bg))}
.matrix-panel.equal-weight,.matrix-panel.primary-weight{font-size:38px}
.matrix-panel.equal-weight>*,.matrix-panel.primary-weight>span{font-weight:400}
.matrix-panel.primary-weight>strong{font-weight:700}
.cta_closing .content{justify-content:center;max-width:850px}
.cta_closing .content::before{content:"";display:block;width:120px;height:8px;background:var(--ink)}
.cta_closing .media{display:none}
.cta_closing:has(>.diagram-demonstration){grid-template-rows:minmax(0,360px) minmax(0,1fr);gap:38px}
.cta_closing>.diagram-demonstration{display:grid;height:100%}
/* Cover text takes its intrinsic height before the diagram uses remaining safe space. */
.cover:is(.split_horizontal,.framed_plate,.svg_diagram,.comparison_dual):has(>.diagram){
  grid-template-rows:minmax(256px,var(--media-row)) max-content;align-content:start;padding-bottom:180px;
  &>.diagram{height:100%;max-height:360px}
  &>.diagram-demonstration{min-height:max-content}
}
.cover:is(.split_horizontal,.framed_plate,.svg_diagram,.comparison_dual):has(>.diagram:not(.diagram-demonstration)){--head:108px}
.cover.comparison_dual:has(>.diagram) h1{font-size:var(--head,116px)}
main:not(.has-media):is(.split_horizontal,.split_vertical,.framed_plate,.svg_diagram,.comparison_dual,.artifact_proof){display:flex;align-items:stretch}
main:not(.has-media):is(.split_horizontal,.split_vertical,.framed_plate,.comparison_dual,.artifact_proof) .content{width:100%;justify-content:center}
.list{display:grid;gap:16px;padding-left:1.15em;font-size:40px;line-height:1.34}
.bento_grid .list{grid-template-columns:1fr 1fr;gap:18px;list-style:none;padding:0}
.bento_grid .list li{border:2px solid var(--ink);padding:18px;font-size:38px;overflow-wrap:anywhere}
.comparison_dual .list{display:flex;gap:30px;list-style:none;padding:0}
.comparison_dual .list li{flex:1;border-top:3px solid var(--ink);padding-top:15px;overflow-wrap:anywhere}
.bridge{z-index:3;position:absolute;right:0;top:606px;width:32px;height:5px;background:var(--ink)}
.bridge.left{left:0;right:auto}
.bridge.color_band_echo{height:34px}
html.measure [data-region]{visibility:hidden}
`;

function fontRules(fonts) {
  const rules = Object.entries(fonts).map(([weight, bytes]) =>
    '@font-face{font-family:"DM Sans";font-style:normal;font-weight:' + weight +
      ';font-display:block;src:url(data:font/ttf;base64,' + bytes.toString('base64') + ') format("truetype")}');
  return rules.join('');
}

export function slideDocument(slide, { index, palette, fonts, fit = {}, scrim = 0.78, incoming }) {
  const dark = usesDarkSurface(slide);
  const bg = dark ? palette.dark : palette.light;
  const fg = dark ? palette.light : palette.dark;
  const ink = dark ? palette.accentOnDark : palette.accentOnLight;
  const stats = slide.figure ? '<p class="figure" data-region="figure">' + escape(slide.figure) + '</p>' : '';
  const content = '<div class="content">' +
    (slide.kicker ? '<p class="kicker" data-region="kicker">' + escape(slide.kicker) + '</p>' : '') +
    stats + '<h1 data-region="headline">' + makeHeadline(slide) + '</h1>' +
    (slide.body ? '<p class="body" data-region="body">' + escape(slide.body) + '</p>' : '') +
    (slide.listItems?.length ? '<ul class="list" data-region="list">' + slide.listItems.map(item => '<li>' + escape(item) + '</li>').join('') + '</ul>' : '') +
    '</div>';
  const source = slide.source ? '<p class="source" data-region="source">' + escape(slide.source) + '</p>' : '';
  const decorative = (kind, edge) => kind ? '<div aria-hidden="true" class="bridge ' + kind + ' ' + edge + '"></div>' : '';
  const parts = [`--bg:${bg}`, `--fg:${fg}`, `--ink:${ink}`, `--scrim-low:${bg}${Math.round(scrim * 0.52 * 255).toString(16).padStart(2,'0')}`, `--scrim-high:${bg}${Math.round(scrim * 255).toString(16).padStart(2,'0')}`];
  if (fit.head) parts.push('--head:' + fit.head + 'px');
  if (fit.body) parts.push('--body:' + fit.body + 'px');
  if (fit.figure) parts.push('--figure:' + fit.figure + 'px');

  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:">' +
    '<style>' + fontRules(fonts) + CSS + '</style><main class="' + slide.layout +
    (index === 1 ? ' cover' : '') + (slide.art ? ' has-art' : '') + (slide.art || slide.diagram ? ' has-media' : '') +
    '" style="' + parts.join(';') + '">' + media(slide) + content + source +
    decorative(incoming, 'left') + decorative(slide.bridge, 'right') + '</main></html>';
}
