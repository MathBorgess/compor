import { parseImageProposal } from '@compor/agents-api/image-proposal';
import { studioImageDimensions } from './studio-image.mjs';

export async function prepareArtworkInput({proposal: value, draft, referenceIds, loadReference, loadBase}) {
  const proposal = parseImageProposal(value);
  const literalText = Object.fromEntries(['headline', 'price', 'date'].map(field => [field, draft.content[field] ?? '']));
  const images = [];
  let total = 0;
  async function attach(id, role, stored) {
    const file = stored?.file;
    if (!(file instanceof Blob)) throw Error('Uma imagem desta proposta não está disponível. Reabra a versão ou adicione a referência novamente.');
    total += file.size;
    if (total > 2 * 1024 * 1024) throw Error('As imagens selecionadas excedem 2 MB. Use menos referências ou arquivos menores nesta geração.');
    await studioImageDimensions(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    images.push(Object.freeze({id, role, mime: file.type, data: btoa(binary)}));
  }
  if (proposal.operation === 'edit') {
    if (proposal.baseImageId !== draft.pieceId || draft.baseVersion < 1) throw Error('Abra uma versão salva com a imagem que deseja editar.');
    await attach(proposal.baseImageId, 'base', await loadBase?.());
  }
  for (const id of proposal.referenceIds) {
    if (!referenceIds.includes(id)) throw Error('A proposta usa uma referência que não pertence a este contexto. Peça ao Compor para revisar a seleção.');
    await attach(id, 'reference', await loadReference?.(id));
  }
  return Object.freeze({
    literalText: Object.freeze(literalText),
    source: proposal.operation === 'edit' ? Object.freeze({pieceId: draft.pieceId, version: draft.baseVersion}) : null,
    images: Object.freeze(images),
  });
}
