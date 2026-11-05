import type {StudioDraft, StoredImage} from './studio-domain.ts';
import type {ArtworkImage} from '@compor/agents-api/artwork-input';
import {parseImageProposal} from '@compor/agents-api/image-proposal';
import {studioImageDimensions} from './studio-image.ts';
import {ARTWORK_TRANSPORT_BYTES, artworkImageBudgets, copyArtworkForTransport} from './studio-artwork-transport.ts';

export type ArtworkPreparationOptions = {
  proposal: unknown;
  draft: StudioDraft;
  referenceIds: string[];
  loadReference?: (id: string) => Promise<StoredImage|null|undefined>;
  loadBase?: () => Promise<StoredImage|null|undefined>;
};
type ArtworkSource = {id: string;role: ArtworkImage['role'];file: Blob;width: number;height: number};
type ImageDescription = {mime: string;width: number;height: number;bytes: number};
export type ArtworkConversion = {id: string;role: ArtworkImage['role'];original: ImageDescription;copy: ImageDescription};

export class ArtworkTransportRequiredError extends Error {
  constructor() { super('As imagens selecionadas excedem 2 MB. Prepare cópias locais para envio antes de gerar.'); }
}

async function artworkSources({proposal: value, draft, referenceIds, loadReference, loadBase}: ArtworkPreparationOptions) {
  const proposal = parseImageProposal(value);
  const sources: ArtworkSource[] = [];
  async function attach(id: string, role: ArtworkImage['role'], stored: StoredImage|null|undefined) {
    const file = stored?.file;
    if (!(file instanceof Blob) || (file.type !== 'image/png' && file.type !== 'image/jpeg')) throw Error('Uma imagem desta proposta não está disponível. Reabra a versão ou adicione a referência novamente.');
    const dimensions = await studioImageDimensions(file);
    sources.push({id, role, file, ...dimensions});
  }
  if (proposal.operation === 'edit') {
    if (proposal.baseImageId !== draft.pieceId || draft.baseVersion < 1) throw Error('Abra uma versão salva com a imagem que deseja editar.');
    await attach(proposal.baseImageId, 'base', await loadBase?.());
  }
  for (const id of proposal.referenceIds) {
    if (!referenceIds.includes(id)) throw Error('A proposta usa uma referência que não pertence a este contexto. Peça ao Compor para revisar a seleção.');
    await attach(id, 'reference', await loadReference?.(id));
  }
  return {proposal, sources};
}

async function sourceFingerprint(sources: readonly ArtworkSource[]) {
  const manifest = [];
  for (const {id, role, file} of sources) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    manifest.push({id, role, mime: file.type, sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')});
  }
  return JSON.stringify(manifest);
}

export async function artworkSourceFingerprint(options: ArtworkPreparationOptions) {
  return sourceFingerprint((await artworkSources(options)).sources);
}

export async function prepareArtworkTransport(options: ArtworkPreparationOptions, {allowConversion = false} = {}) {
  const {proposal, sources} = await artworkSources(options);
  if (!allowConversion && sources.reduce((sum, source) => sum + source.file.size, 0) > ARTWORK_TRANSPORT_BYTES) throw new ArtworkTransportRequiredError();
  const fingerprint = await sourceFingerprint(sources);
  const budgets = artworkImageBudgets(sources.map(source => source.file.size));
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw Error('Formato de imagem não suportado.');
    images.push(Object.freeze({id: source.id, role: source.role, mime: file.type, data: btoa(binary)}));
  }
  const artworkInput = Object.freeze({
    literalText: Object.freeze({headline: options.draft.content.headline, price: options.draft.content.price, date: options.draft.content.date}),
    source: proposal.operation === 'edit' ? Object.freeze({pieceId: options.draft.pieceId, version: options.draft.baseVersion}) : null,
    images: Object.freeze(images),
  });
  return {artworkInput, conversions: Object.freeze(conversions), sourceFingerprint: fingerprint};
}

export async function prepareArtworkInput(options: ArtworkPreparationOptions) {
  return (await prepareArtworkTransport(options)).artworkInput;
}
