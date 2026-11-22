import {imageBase64,sha256Hex} from './browser-bytes.ts';
import type {PostFormat,StudioDraft, StoredImage} from './studio-domain.ts';
import type {ArtworkFrame,ArtworkImage} from '@compor/agents-api/artwork-input';
import {parseImageProposal} from '@compor/agents-api/image-proposal';
import {studioImageDimensions,studioImageDimensionsMatch} from './studio-image.ts';
import {ARTWORK_TRANSPORT_BYTES, artworkImageBudgets, copyArtworkForTransport} from './studio-artwork-transport.ts';
import {selectedVisualSources,type SelectedVisualInput} from './selected-visual-input.ts';

export type ArtworkPreparationOptions = {
  proposal: unknown;
  draft: StudioDraft;
  format?: PostFormat;
  referenceIds: string[];
  loadReference?: (id: string) => Promise<StoredImage|null|undefined>;
  loadBase?: (frameId?: string) => Promise<StoredImage|null|undefined>;
  loadAnchor?: (anchorFrameId: string) => Promise<StoredImage|null|undefined>;
  visualSnapshot?: SelectedVisualInput;
};
type ArtworkSource = {id: string;role: ArtworkImage['role'];file: Blob;width: number;height: number};
type ImageDescription = {mime: string;width: number;height: number;bytes: number};
export type ArtworkConversion = {id: string;role: ArtworkImage['role'];original: ImageDescription;copy: ImageDescription};

export class ArtworkTransportRequiredError extends Error {
  constructor() { super('As imagens selecionadas excedem 2 MB. Prepare cópias locais para envio antes de gerar.'); }
}

async function artworkSources({proposal: value, draft, format, referenceIds, loadReference, loadBase, loadAnchor, visualSnapshot}: ArtworkPreparationOptions) {
  const proposal = parseImageProposal(value);
  const resolvedFormat: PostFormat | undefined = proposal.format ?? format ?? draft.content.format;
  const multiFrame = resolvedFormat === 'carousel' || resolvedFormat === 'collection';
  const orderedFrames = multiFrame && draft.content.frames ? [...draft.content.frames].sort((a, b) => a.position - b.position) : [];
  const targetFrame = multiFrame && proposal.frameId ? orderedFrames.find(frame => frame.id === proposal.frameId) : undefined;
  if (multiFrame && proposal.frameId && !targetFrame) throw Error('A lâmina indicada na proposta não existe neste post.');
  const anchorFrame = multiFrame && targetFrame && targetFrame.position > 1 ? orderedFrames[0] : undefined;
  const sources: ArtworkSource[] = [];
  async function attach(id: string, role: ArtworkImage['role'], stored: StoredImage|null|undefined) {
    const file = stored?.file;
    if (!(file instanceof Blob) || (file.type !== 'image/png' && file.type !== 'image/jpeg')) throw Error('Uma imagem desta proposta não está disponível. Reabra a versão ou adicione a referência novamente.');
    let dimensions = await studioImageDimensions(file);
    const metadata=stored?.metadata;
    if(metadata&&typeof metadata==='object'&&'width' in metadata&&'height' in metadata&&typeof metadata.width==='number'&&typeof metadata.height==='number'){
      const displayed={width:metadata.width,height:metadata.height};
      if(!await studioImageDimensionsMatch(file,dimensions,displayed))throw Error('Uma imagem desta proposta não está disponível. Reabra a versão ou adicione a referência novamente.');
      dimensions=displayed;
    }
    sources.push({id, role, file, ...dimensions});
  }
  if (proposal.operation === 'edit') {
    if (proposal.baseImageId !== draft.pieceId || draft.baseVersion < 1) throw Error('Abra uma versão salva com a imagem que deseja editar.');
    await attach(proposal.baseImageId, 'base', await loadBase?.(targetFrame?.id));
  }
  if (anchorFrame && loadAnchor) {
    const storedAnchor = await loadAnchor(anchorFrame.id);
    if (storedAnchor?.file && !sources.some(source => source.id === anchorFrame.id) && !proposal.referenceIds.includes(anchorFrame.id)) {
      await attach(anchorFrame.id, 'anchor', storedAnchor);
    }
  }
  const references=visualSnapshot?await selectedVisualSources(visualSnapshot,proposal.referenceIds):null;
  if (proposal.referenceIds.some(id=>!referenceIds.includes(id))) throw Error('A proposta usa uma referência que não pertence a este contexto. Peça ao Compor para revisar a seleção.');
  if (references) {
    for (const {id,file,width,height} of references) sources.push({id,role:'reference',file,width,height});
  } else {
    for (const id of proposal.referenceIds) await attach(id,'reference',await loadReference?.(id));
  }
  const frame: ArtworkFrame | undefined = targetFrame ? Object.freeze({
    id: targetFrame.id,
    position: targetFrame.position,
    total: orderedFrames.length,
    role: targetFrame.role,
    headline: targetFrame.headline,
    body: targetFrame.body,
    ...(targetFrame.visualCue ? { visualCue: targetFrame.visualCue } : {}),
    ...(draft.content.visualInvariants ? { visualInvariants: draft.content.visualInvariants } : {}),
  }) : undefined;
  return {proposal, sources, format: resolvedFormat, frame};
}

async function sourceFingerprint(sources: readonly ArtworkSource[]) {
  const manifest = [];
  for (const {id, role, file} of sources) {
    manifest.push({id, role, mime: file.type, sha256:await sha256Hex(await file.arrayBuffer())});
  }
  return JSON.stringify(manifest);
}

export async function artworkSourceFingerprint(options: ArtworkPreparationOptions) {
  return sourceFingerprint((await artworkSources(options)).sources);
}

export async function prepareArtworkTransport(options: ArtworkPreparationOptions, {allowConversion = false} = {}) {
  const {proposal, sources, format, frame} = await artworkSources(options);
  if (!allowConversion && sources.reduce((sum, source) => sum + source.file.size, 0) > ARTWORK_TRANSPORT_BYTES) throw new ArtworkTransportRequiredError();
  const fingerprint = await sourceFingerprint(sources);
  const referenceBytes=options.visualSnapshot?sources.filter(source=>source.role==='reference').reduce((sum,source)=>sum+source.file.size,0):0;
  const nonReferenceSizes = options.visualSnapshot ? sources.filter(source => source.role !== 'reference').map(source => source.file.size) : [];
  const nonReferenceBudgets = options.visualSnapshot && nonReferenceSizes.length
    ? artworkImageBudgets(nonReferenceSizes, Math.max(0, ARTWORK_TRANSPORT_BYTES - referenceBytes))
    : [];
  let nonRefIndex = 0;
  const budgets = options.visualSnapshot
    ? sources.map(source => source.role === 'reference' ? source.file.size : nonReferenceBudgets[nonRefIndex++] ?? 0)
    : artworkImageBudgets(sources.map(source => source.file.size));
  if(budgets.some(budget=>budget<1))throw new ArtworkTransportRequiredError();
  const conversions: ArtworkConversion[] = [], images: ArtworkImage[] = [];
  for (const [index, source] of sources.entries()) {
    let file = source.file;
    if (file.size > budgets[index]) {
      const copy = await copyArtworkForTransport(file, budgets[index]);
      conversions.push(Object.freeze({id: source.id, role: source.role,
        original: {mime: file.type, width: source.width, height: source.height, bytes: file.size},
        copy: {mime: copy.file.type, width: copy.width, height: copy.height, bytes: copy.file.size},
      }));
      file = copy.file;
    }
    const data=await imageBase64(file);
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw Error('Formato de imagem não suportado.');
    images.push(Object.freeze({id: source.id, role: source.role, mime: file.type, data}));
  }
  const headline = frame ? (frame.headline || options.draft.content.headline) : options.draft.content.headline;
  const artworkInput = Object.freeze({
    literalText: Object.freeze({headline, price: options.draft.content.price, date: options.draft.content.date, ...(options.draft.content.fields !== undefined ? {fields: options.draft.content.fields.map(field => ({...field}))} : {})}),
    source: proposal.operation === 'edit' ? Object.freeze({pieceId: options.draft.pieceId, version: options.draft.baseVersion}) : null,
    images: Object.freeze(images),
    ...(options.visualSnapshot ? {visualInput: options.visualSnapshot.manifest} : {}),
    ...(format !== undefined ? {format} : {}),
    ...(frame !== undefined ? {frame} : {}),
  });
  return {artworkInput, conversions: Object.freeze(conversions), sourceFingerprint: fingerprint};
}

export async function prepareArtworkInput(options: ArtworkPreparationOptions) {
  return (await prepareArtworkTransport(options)).artworkInput;
}
