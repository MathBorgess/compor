import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, lstat, unlink, link, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** The host owns the identity and the root. This is not authentication. */
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const pieceId = z.string().regex(/^piece_[0-9a-f]{32}$/u);
const versionId = z.string().regex(/^v_[0-9a-f]{32}$/u);
const sourceRef = z.strictObject({ piece_id: pieceId, version_id: versionId });
const savedSource = sourceRef.extend({ snapshot_sha256: z.string().regex(/^[0-9a-f]{64}$/), base_sha256: z.string().regex(/^[0-9a-f]{64}$/) });
const text = z.string().min(1).max(280).refine(s => !/[\u0000-\u001f\u007f]/u.test(s));
const caption = z.strictObject({
  text: z.string().min(1).max(10000).refine(s => s.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s)),
  origin: z.enum(['person', 'agent_proposal']),
});
const layer = z.strictObject({
  id, text,
  x: z.number().min(0).max(1).describe('Âncora horizontal como fração da largura, de 0 a 1, não pixels. Padrão: início do texto; para centralizar em x, use text_anchor=middle.'),
  y: z.number().min(0).max(1).describe('Início vertical do texto como fração da altura, de 0 a 1, não pixels.'),
  text_anchor: z.enum(['start', 'middle', 'end']).optional().describe('Alinhamento do texto em torno de x: start (padrão), middle ou end.'),
  font_size_px: z.number().min(8).max(600).describe('Tamanho de fonte em pixels da imagem original.'), color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font_family: z.enum(['serif', 'sans-serif', 'monospace']),
  font_weight: z.enum(['normal', 'bold']).optional(),
  font_style: z.enum(['normal', 'italic']).optional(),
  rotate_deg: z.number().min(-15).max(15).optional().describe('Rotação opcional do texto em graus em torno da âncora; confira o resultado visual.'),
});
const snapshotSchema = z.strictObject({
  format: z.literal('compor-local-creative-v1'), piece_id: id, version_id: id,
  parent_version_id: id.nullable(), revision: z.number().int().positive(), created_at: z.string(),
  width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
  base_sha256: z.string().regex(/^[0-9a-f]{64}$/), layers: z.array(layer).min(1).max(20),
  // Optional so previously saved v1 snapshots remain readable without rewriting.
  derived_from: savedSource.optional(),
  // A declared source, not verified authorship or an approval. Absent in old snapshots.
  caption: caption.optional(),
});
type Snapshot = z.infer<typeof snapshotSchema>;
type TextLayer = z.infer<typeof layer>;
type SourceRef = z.infer<typeof sourceRef>;
type Caption = z.infer<typeof caption>;
const pngLimit = 8 * 1024 * 1024;
const imageSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const uid = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function parsePngBytes(bytes: Buffer): { bytes: Buffer; width: number; height: number } {
  // Header is checked, not a full PNG decode.
  if (bytes.length < 33 || bytes.length > pngLimit || !bytes.subarray(0, 8).equals(imageSignature) || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('A base deve ser um PNG com cabeçalho válido.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 40_000_000) throw new Error('Dimensões da base excedem o limite.');
  return { bytes, width, height };
}
function parsePng(encoded: string): { bytes: Buffer; width: number; height: number } {
  // Exact base64 only; bounded before decoding.
  if (encoded.length > Math.ceil(pngLimit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new Error('Imagem inválida ou maior que o limite.');
  return parsePngBytes(Buffer.from(encoded, 'base64'));
}
function uniqueLayers(layers: TextLayer[]): void {
  if (new Set(layers.map(l => l.id)).size !== layers.length) throw new Error('IDs de camadas devem ser únicos.');
}
function renderSvg(s: Snapshot, base: Buffer): string {
  const labels = s.layers.map(l => {
    const x = Math.round(l.x * s.width), y = Math.round(l.y * s.height);
    return `<text id="${xml(l.id)}" x="${x}" y="${y}"${l.text_anchor ? ` text-anchor="${l.text_anchor}"` : ''}${l.font_weight ? ` font-weight="${l.font_weight}"` : ''}${l.font_style ? ` font-style="${l.font_style}"` : ''}${l.rotate_deg !== undefined ? ` transform="rotate(${l.rotate_deg} ${x} ${y})"` : ''} font-family="${l.font_family}" font-size="${l.font_size_px}" fill="${l.color_hex}" dominant-baseline="hanging">${xml(l.text)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}"><image width="${s.width}" height="${s.height}" xlink:href="data:image/png;base64,${base.toString('base64')}"/><g id="texto-editavel">${labels}</g></svg>`;
}
async function privateDirectory(path: string): Promise<void> {
  try { await mkdir(path, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Diretório local inseguro.');
}
async function readPrivateFile(path: string, limit: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit || (stat.mode & 0o077) !== 0) throw new Error('Arquivo local inseguro ou grande demais.');
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function writeNew(path: string, value: string | Buffer): Promise<void> {
  // Atomic publication without replacement: a complete private sibling is
  // linked to the final name, and an existing destination makes link fail.
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  const file = await open(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
    await file.close();
    await link(tmp,path);
  } finally { await file.close().catch(() => {}); await unlink(tmp).catch(() => {}); }
}

/** Local snapshots are immutable; only the bound host identity can access its namespace. */
export class LocalCreativeStore {
  readonly root: string;
  private readonly owner: string;
  private readonly allowedImageRoots: readonly string[];
  constructor(root: string, owner: string, options: { allowedImageRoots?: readonly string[] } = {}) {
    if (!owner.trim()) throw new Error('Identidade do host ausente.');
    this.root = resolve(root);
    this.owner = owner;
    this.allowedImageRoots = (options.allowedImageRoots ?? []).map(root => resolve(root));
  }
  private assertOwner(actor: string): void { if (actor !== this.owner) throw new Error('Identidade local não autorizada.'); }
  private async actorDir(actor: string): Promise<string> {
    this.assertOwner(actor);
    // Host must supply an existing private root, avoiding implicit creation under untrusted paths.
    const rootStat = await lstat(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o077) !== 0) throw new Error('Raiz local insegura.');
    const dir = join(this.root, `owner_${hash(Buffer.from(actor)).slice(0, 32)}`);
    await privateDirectory(dir);
    return dir;
  }
  private async pieceDir(actor: string, pieceId: string): Promise<string> {
    if (!/^piece_[0-9a-f]{32}$/u.test(pieceId)) throw new Error('Identificador de peça inválido.');
    const dir = join(await this.actorDir(actor), pieceId);
    const stat = await lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error('Peça indisponível.');
    return dir;
  }
  private async list(dir: string, pieceId: string): Promise<Snapshot[]> {
    const names = (await readdir(dir)).filter(n => /^snapshot_v_[0-9a-f]{32}\.json$/u.test(n));
    if (names.length > 500) throw new Error('Histórico excede o limite local.');
    const snapshots = await Promise.all(names.map(async name => {
      const snapshot=snapshotSchema.parse(JSON.parse((await readPrivateFile(join(dir,name),100_000)).toString('utf8')));
      if (snapshot.piece_id!==pieceId || name!==`snapshot_${snapshot.version_id}.json`) throw new Error('Histórico local inconsistente.');
      return snapshot;
    }));
    snapshots.sort((a,b) => a.revision - b.revision);
    for (let i=0; i<snapshots.length; i++) if (snapshots[i]!.revision !== i+1 || snapshots[i]!.parent_version_id !== (i ? snapshots[i-1]!.version_id : null)) throw new Error('Histórico local inconsistente.');
    const origin = JSON.stringify(snapshots[0]?.derived_from ?? null);
    if (snapshots.some(snapshot => JSON.stringify(snapshot.derived_from ?? null) !== origin)) throw new Error('Origem local inconsistente no histórico.');
    return snapshots;
  }
  /** Read only the named version's parent chain when a different snapshot is corrupt.
   * This is a partial recovery, never a claim that the full piece history is sound. */
  private async versionPrefix(dir: string, piece: string, version: string): Promise<Snapshot[]> {
    const reverse: Snapshot[] = [];
    const seen = new Set<string>();
    let cursor: string | null = version;
    while (cursor !== null) {
      if (!/^v_[0-9a-f]{32}$/u.test(cursor) || seen.has(cursor) || seen.size >= 500) throw new Error('Cadeia de versões local inválida.');
      seen.add(cursor);
      let bytes: Buffer;
      try { bytes = await readPrivateFile(join(dir, `snapshot_${cursor}.json`), 100_000); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Versão indisponível.'); throw e; }
      const snapshot = snapshotSchema.parse(JSON.parse(bytes.toString('utf8')));
      if (snapshot.piece_id !== piece || snapshot.version_id !== cursor) throw new Error('Cadeia de versões local inconsistente.');
      reverse.push(snapshot);
      cursor = snapshot.parent_version_id;
    }
    const snapshots = reverse.reverse();
    const origin = JSON.stringify(snapshots[0]?.derived_from ?? null);
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i]!;
      if (snapshot.revision !== i + 1 || snapshot.parent_version_id !== (i ? snapshots[i-1]!.version_id : null) || JSON.stringify(snapshot.derived_from ?? null) !== origin) throw new Error('Cadeia de versões local inconsistente.');
    }
    return snapshots;
  }
  private async writeVersion(dir: string, snapshot: Snapshot, base: Buffer): Promise<string> {
    const svgPath = join(dir, `preview_${snapshot.version_id}.svg`);
    await writeNew(svgPath, renderSvg(snapshot, base));
    // Snapshot is the commit marker; the SVG is never overwritten. On a process crash,
    // an orphan SVG may remain as recoverable evidence and is not treated as a version.
    try { await writeNew(join(dir, `snapshot_${snapshot.version_id}.json`), JSON.stringify(snapshot, null, 2) + '\n'); }
    catch (e) { await unlink(svgPath).catch(() => {}); throw e; }
    return svgPath;
  }
  async create(actor: string, input: { base_png_base64: string; layers: TextLayer[]; derived_from?: SourceRef; caption?: Caption }) {
    this.assertOwner(actor);
    const layers = z.array(layer).min(1).max(20).parse(input.layers); uniqueLayers(layers);
    const base = parsePng(input.base_png_base64), pieceId = uid('piece'), versionId = uid('v');
    const source = input.derived_from !== undefined ? sourceRef.parse(input.derived_from) : undefined;
    const declaredCaption = input.caption !== undefined ? caption.parse(input.caption) : undefined;
    // Reserve one depth level for the new piece, preventing unreadable chains.
    const parent = source ? await this.readChecked(actor, source.piece_id, source.version_id, new Set(['new-piece-reserved'])) : undefined;
    const derivedFrom = parent && source ? { ...source, snapshot_sha256: hash(Buffer.from(JSON.stringify(parent.snapshot))), base_sha256: parent.snapshot.base_sha256 } : undefined;
    const ownerDir = await this.actorDir(actor), dir = join(ownerDir,pieceId);
    await mkdir(dir,{mode:0o700});
    await writeNew(join(dir,'base.png'),base.bytes);
    const snapshot = snapshotSchema.parse({ format:'compor-local-creative-v1', piece_id:pieceId, version_id:versionId, parent_version_id:null, revision:1, created_at:new Date().toISOString(), width:base.width, height:base.height, base_sha256:hash(base.bytes), layers, ...(derivedFrom ? { derived_from: derivedFrom } : {}), ...(declaredCaption ? { caption: declaredCaption } : {}) });
    return { snapshot, svg_path: await this.writeVersion(dir,snapshot,base.bytes), warnings: parent?.warnings ?? [] };
  }
  async createFromFile(actor: string, input: { local_png_path: string; confirm_local_image_use: boolean; layers: TextLayer[]; derived_from?: SourceRef; caption?: Caption }) {
    this.assertOwner(actor);
    if (input.confirm_local_image_use !== true) throw new Error('Uso da imagem local não autorizado.');
    const path = input.local_png_path;
    if (!isAbsolute(path) || path !== resolve(path) || path.length > 4096 || path.includes('\0')) throw new Error('Caminho de imagem inválido.');
    const root = dirname(path);
    // Only direct children of an explicit host-approved directory: no caller
    // path may add nested directories, traverse, or choose another root.
    if (!this.allowedImageRoots.includes(root)) throw new Error('Imagem fora dos diretórios autorizados pelo host.');
    const rootStat=await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(root) !== root) throw new Error('Diretório de imagem inseguro.');
    const before=await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > pngLimit || await realpath(path) !== path) throw new Error('Imagem local indisponível ou insegura.');
    const file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const stat=await file.stat();
      if (!stat.isFile() || stat.size > pngLimit || stat.ino !== before.ino || stat.dev !== before.dev) throw new Error('Imagem local mudou; tente novamente.');
      bytes=await file.readFile();
      const after=await lstat(path), rootAfter=await lstat(root), end=await file.stat();
      if (!after.isFile() || after.isSymbolicLink() || after.ino!==stat.ino || after.dev!==stat.dev || rootAfter.ino!==rootStat.ino || rootAfter.dev!==rootStat.dev || end.size!==stat.size || bytes.length!==stat.size || await realpath(path)!==path) throw new Error('Imagem local mudou; tente novamente.');
    } finally { await file.close(); }
    parsePngBytes(bytes);
    return this.create(actor,{base_png_base64:bytes.toString('base64'),layers:input.layers,derived_from:input.derived_from,caption:input.caption});
  }
  async read(actor: string, pieceId: string, versionId?: string) {
    return this.readChecked(actor,pieceId,versionId,new Set());
  }
  private async readChecked(actor: string, pieceId: string, versionId: string | undefined, visited: Set<string>): Promise<{ snapshot: Snapshot; svg_path: string; history: Array<{ version_id:string; parent_version_id:string|null; revision:number; created_at:string }>; history_complete: boolean; warnings: string[] }> {
    const dir = await this.pieceDir(actor,pieceId);
    if (versionId !== undefined && !/^v_[0-9a-f]{32}$/u.test(versionId)) throw new Error('Identificador de versão inválido.');
    let snapshots: Snapshot[], historyComplete = true;
    try { snapshots = await this.list(dir,pieceId); }
    catch (error) {
      if (!versionId) throw error; // The latest version must not hide a corrupt history.
      snapshots = await this.versionPrefix(dir,pieceId,versionId);
      historyComplete = false;
    }
    const snapshot = versionId ? snapshots.find(s=>s.version_id===versionId) : snapshots.at(-1);
    if (!snapshot) throw new Error('Versão indisponível.');
    const marker = `${pieceId}/${snapshot.version_id}`;
    if (visited.has(marker) || visited.size >= 64) throw new Error('Cadeia de origem local inválida ou longa demais.');
    visited.add(marker);
    const base = await readPrivateFile(join(dir,'base.png'),pngLimit);
    if (hash(base) !== snapshot.base_sha256) throw new Error('Imagem base alterada; leitura bloqueada.');
    const svgPath = join(dir,`preview_${snapshot.version_id}.svg`);
    const svg = await readPrivateFile(svgPath, Math.ceil(pngLimit * 1.4) + 100_000);
    if (svg.toString('utf8') !== renderSvg(snapshot,base)) throw new Error('Prévia local alterada; leitura bloqueada.');
    const warnings = historyComplete ? [] : [`Histórico completo indisponível para ${pieceId}; somente a cadeia da versão solicitada foi verificada.`];
    if (snapshot.derived_from) {
      const source = snapshot.derived_from;
      const parent = await this.readChecked(actor,source.piece_id,source.version_id,visited);
      if (parent.snapshot.base_sha256 !== source.base_sha256 || hash(Buffer.from(JSON.stringify(parent.snapshot))) !== source.snapshot_sha256) throw new Error('Origem local alterada; leitura bloqueada.');
      warnings.push(...parent.warnings);
    }
    return { snapshot, svg_path:svgPath, history:snapshots.map(s=>({ version_id:s.version_id, parent_version_id:s.parent_version_id, revision:s.revision, created_at:s.created_at })), history_complete:historyComplete, warnings };
  }
  async edit(actor: string, input: { piece_id: string; expected_version_id: string; layer_id: string; text: string }) {
    this.assertOwner(actor);
    const data=z.strictObject({ piece_id:id,expected_version_id:id,layer_id:id,text }).parse(input);
    const dir = await this.pieceDir(actor,data.piece_id), lockPath = join(dir,'.edit.lock');
    // Lock must be exclusively created; existing locks are never removed by another caller.
    const lock = await open(lockPath,constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,0o600);
    try {
      const current=await this.read(actor,data.piece_id);
      if (current.snapshot.version_id !== data.expected_version_id) throw new Error('A versão mudou; leia a versão atual antes de editar.');
      if (current.history.length >= 500) throw new Error('Histórico excede o limite local.');
      const target=current.snapshot.layers.find(l=>l.id===data.layer_id);
      if (!target) throw new Error('Camada de texto não encontrada.');
      const base=await readPrivateFile(join(dir,'base.png'),pngLimit);
      if (hash(base)!==current.snapshot.base_sha256) throw new Error('Imagem base alterada; edição bloqueada.');
      const snapshot=snapshotSchema.parse({ ...current.snapshot, version_id:uid('v'), parent_version_id:current.snapshot.version_id, revision:current.snapshot.revision+1, created_at:new Date().toISOString(), layers:current.snapshot.layers.map(l=>l.id===data.layer_id?{...l,text:data.text}:l) });
      return { snapshot, previous_text:target.text, svg_path:await this.writeVersion(dir,snapshot,base), warnings:current.warnings };
    } finally { await lock.close(); await unlink(lockPath); }
  }

  /** The caption is text outside the artwork; it cannot approve or export the piece. */
  async setCaption(actor: string, input: { piece_id: string; expected_version_id: string; caption: Caption }) {
    this.assertOwner(actor);
    const data = z.strictObject({ piece_id: pieceId, expected_version_id: versionId, caption }).parse(input);
    const dir = await this.pieceDir(actor, data.piece_id), lockPath = join(dir, '.edit.lock');
    const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      const current = await this.read(actor, data.piece_id);
      if (current.snapshot.version_id !== data.expected_version_id) throw new Error('A versão mudou; leia a versão atual antes de editar.');
      if (current.history.length >= 500) throw new Error('Histórico excede o limite local.');
      const base = await readPrivateFile(join(dir, 'base.png'), pngLimit);
      if (hash(base) !== current.snapshot.base_sha256) throw new Error('Imagem base alterada; edição bloqueada.');
      const snapshot = snapshotSchema.parse({ ...current.snapshot, version_id: uid('v'), parent_version_id: current.snapshot.version_id, revision: current.snapshot.revision + 1, created_at: new Date().toISOString(), caption: data.caption });
      return { snapshot, previous_caption: current.snapshot.caption ?? null, svg_path: await this.writeVersion(dir, snapshot, base), warnings: current.warnings };
    } finally { await lock.close(); await unlink(lockPath); }
  }
}

/** Actor is host-bound; the optional input path is limited to host-approved image roots. */
export function registerLocalCreativeTools(server: McpServer, actor: string, store: LocalCreativeStore): void {
  const warningText = (warnings: string[]) => warnings.length ? ` Atenção: ${warnings.join(' ')}` : '';
  // Some clients expose only text content to the model, even though structuredContent
  // is present in the protocol response. Include the identifiers required for a
  // subsequent revision there as well, without duplicating the full artwork.
  const continuation = (result: { snapshot: Snapshot; svg_path: string }) => ({
    type:'text' as const,
    text:JSON.stringify({piece_id:result.snapshot.piece_id,version_id:result.snapshot.version_id,parent_version_id:result.snapshot.parent_version_id,revision:result.snapshot.revision,layer_ids:result.snapshot.layers.map(l=>l.id),svg_path:result.svg_path}),
  });
  server.registerTool('creative_local_create', {
    title:'Criar peça local com texto em camadas',
    description:'Salva uma cópia local privada da base PNG fornecida e camadas de texto; gera um SVG local, sem Supabase ou HTML. Use apenas quando a pessoa pediu criar a peça com esses dados. Se esta peça deriva de uma versão anterior, informe derived_from com IDs existentes da mesma pessoa; o vínculo registra uma alegação, não prova causalidade ou autoria, não aprova e não copia automaticamente o texto anterior. A base não é gerada por esta ferramenta; solicite uma base sem textos incorporados ao gerador disponível. Cabeçalho PNG é validado, não há decodificação integral. Revisão visual e legibilidade dependem do cliente.',
    inputSchema:{ base_png_base64:z.string().max(Math.ceil(pngLimit/3)*4), layers:z.array(layer).min(1).max(20), derived_from:sourceRef.optional().describe('Peça e versão existentes da mesma identidade, somente quando esta criação deriva explicitamente delas.'), caption:caption.optional().describe('Legenda revisável e origem declarada; não representa aprovação.') },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:false},
  }, async args => { const result=await store.create(actor,args); return {content:[{type:'text' as const,text:'Criei uma versão local em SVG com textos separados. Confira o arquivo e sua legibilidade; o cliente precisa suportar SVG.' + warningText(result.warnings)},continuation(result)],structuredContent:result}; });
  server.registerTool('creative_local_create_from_file', {
    title:'Criar peça a partir de imagem local autorizada',
    description:'Copia uma imagem PNG local para armazenamento privado da peça e cria uma versão SVG com texto separado. Se esta peça deriva de uma versão anterior, informe derived_from com IDs existentes da mesma pessoa; o vínculo registra uma alegação, não prova causalidade ou autoria, não aprova e não copia automaticamente o texto anterior. Apenas arquivos diretos nos diretórios explicitamente permitidos pelo host são aceitos; não há navegação ou acesso arbitrário. Use confirm_local_image_use=true somente quando a pessoa solicitou o uso desta imagem local. A leitura local não autoriza compartilhamento nem envio externo. A ferramenta não gera imagem, nem decodifica integralmente o PNG; confira a renderização no cliente.',
    inputSchema:{ local_png_path:z.string().min(1).max(4096), confirm_local_image_use:z.boolean(), layers:z.array(layer).min(1).max(20), derived_from:sourceRef.optional().describe('Peça e versão existentes da mesma identidade, somente quando esta criação deriva explicitamente delas.'), caption:caption.optional().describe('Legenda revisável e origem declarada; não representa aprovação.') },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:false},
  }, async args => { const result=await store.createFromFile(actor,args); return {content:[{type:'text' as const,text:'Criei uma versão local com textos separados. A cópia da base e o SVG ficam locais; revise a prévia e a legibilidade.' + warningText(result.warnings)},continuation(result)],structuredContent:result}; });
  server.registerTool('creative_local_edit_text', {
    title:'Editar texto de uma peça local',
    description:'Cria uma nova versão sem sobrescrever a anterior ou a imagem base. Use somente após solicitação explícita da pessoa; use o ID da camada e a versão atual. Não altera nem cria uma preferência de perfil por si só. Após editar, registre o sinal de edição no perfil somente se a personalização estiver autorizada.',
    inputSchema:{ piece_id:id, expected_version_id:id, layer_id:id, text },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:false},
  }, async args => { const result=await store.edit(actor,args); return {content:[{type:'text' as const,text:'Atualizei o texto em uma nova versão local. A versão anterior e a base foram preservadas; confira a prévia SVG.' + warningText(result.warnings)},continuation(result)],structuredContent:result}; });
  server.registerTool('creative_local_set_caption', {
    title:'Criar ou editar legenda da peça local',
    description:'Salva uma legenda em nova versão sem modificar a imagem ou suas camadas, com a origem declarada person ou agent_proposal. Use person apenas para texto atribuído explicitamente à pessoa; agent_proposal indica texto proposto pelo agente. A origem é alegação do cliente, não comprova autoria, não implica aprovação e não envia nem publica o texto. Use somente quando solicitado ou ao preparar um rascunho revisável; registre sinal de edição no perfil apenas quando autorizado.',
    inputSchema:{ piece_id:pieceId, expected_version_id:versionId, caption },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:false},
  }, async args => { const result=await store.setCaption(actor,args); return {content:[{type:'text' as const,text:'Registrei a legenda em nova versão local; ela continua revisável e não foi publicada.' + warningText(result.warnings)},continuation(result)],structuredContent:result}; });
  server.registerTool('creative_local_read', {
    title:'Ler peça local e histórico',
    description:'Lê uma versão local da identidade vinculada pelo host; sem version_id retorna a atual. Não autentica pessoas, compartilha arquivos ou garante visualização pelo cliente.',
    inputSchema:{ piece_id:id, version_id:id.optional() },
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},
  }, async args => { const result=await store.read(actor,args.piece_id,args.version_id); return {content:[{type:'text' as const,text:'Versão local carregada.' + warningText(result.warnings)},continuation(result)],structuredContent:result}; });
}
