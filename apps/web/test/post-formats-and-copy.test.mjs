import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudioState,
  updateBrandVoice,
  setPostFormat,
  setDraftFrames,
  updateDraftFrame,
  reorderDraftFrames,
  parseStudioState,
} from '../lib/studio-state.ts';
import {
  startPostPreparation,
  updatePostPreparation,
  completePostPreparation,
} from '../lib/studio-workflow.ts';
import { postFormatOf, postTargetFrameCountOf } from '../lib/studio-post-context.ts';
import { prepareArtworkInput } from '../lib/studio-artwork-input.ts';
import { parallelExplorationContext } from '../lib/parallel-exploration-context.ts';

const uuid = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pngBytes = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(10, 16);
  b.writeUInt32BE(10, 20);
  return b;
})();

test('preparação de post preserva formato, contagem de lâminas e Voz da marca no estado validado', () => {
  const userId = uuid(1), projectId = uuid(2), pieceId = uuid(3);
  let state = createStudioState({ userId, projectId });
  state = updateBrandVoice(state, {
    tone: 'Direto, técnico e concreto',
    examples: 'Corte metade do texto antes de abrir o editor.',
    avoid: 'destrave, revolucione',
  });
  assert.equal(state.brandVoice?.tone, 'Direto, técnico e concreto');
  state = startPostPreparation(state, pieceId);
  state = updatePostPreparation(state, { name: 'Carrossel de lançamento', format: 'carousel', targetFrameCount: 4, objective: 'Educar', message: 'Como escrever ganchos' });
  assert.equal(state.workflow.pendingPost?.format, 'carousel');
  assert.equal(state.workflow.pendingPost?.targetFrameCount, 4);

  state = completePostPreparation(state);
  assert.equal(postFormatOf(state, pieceId), 'carousel');
  assert.equal(postTargetFrameCountOf(state, pieceId), 4);
  const draft = state.drafts.find(item => item.pieceId === pieceId);
  assert.equal(draft?.content.format, 'carousel');
  assert.equal(draft?.content.frames?.length, 4);
  assert.equal(draft?.content.frames?.[0].role, 'capa');

  // Reordenar e editar lâmina cirurgicamente
  const firstId = draft.content.frames[0].id;
  const secondId = draft.content.frames[1].id;
  state = updateDraftFrame(state, { pieceId, baseVersion: 0, frameId: firstId, patch: { headline: 'Pare de perder alcance' } });
  assert.equal(state.drafts[0].content.headline, 'Pare de perder alcance');
  state = reorderDraftFrames(state, { pieceId, baseVersion: 0, fromIndex: 0, toIndex: 1 });
  assert.equal(state.drafts[0].content.frames[0].id, secondId);
  assert.equal(state.drafts[0].content.frames[0].position, 1);

  // Trocar para Coleção (2 fotos) e Story (9:16 sem frames)
  state = setPostFormat(state, pieceId, 'collection', 2);
  assert.equal(postFormatOf(state, pieceId), 'collection');
  assert.equal(state.drafts[0].content.frames?.length, 2);

  state = setPostFormat(state, pieceId, 'story');
  assert.equal(postFormatOf(state, pieceId), 'story');
  assert.equal(state.drafts[0].content.frames, undefined);
  assert.doesNotThrow(() => parseStudioState(JSON.parse(JSON.stringify(state))));
});

test('prepareArtworkInput anexa Lâmina 1 como âncora visual ao preparar Lâmina 2 de Carrossel', async () => {
  const userId = uuid(1), projectId = uuid(2), pieceId = uuid(3);
  let state = createStudioState({ userId, projectId });
  state = startPostPreparation(state, pieceId);
  state = updatePostPreparation(state, { name: 'Coleção café', format: 'collection', targetFrameCount: 3 });
  state = completePostPreparation(state);
  const frames = state.drafts[0].content.frames;
  state = setDraftFrames(state, {
    pieceId,
    baseVersion: 0,
    visualInvariants: 'Luz natural quente pela esquerda, grão suave',
    frames: [
      { id: frames[0].id, position: 1, role: 'abertura', headline: 'Torra fresca toda terça', body: '', visualCue: 'Saco kraft na mesa' },
      { id: frames[1].id, position: 2, role: 'detalhe', headline: 'Moagem para coado', body: 'Notas de caramelo.', visualCue: 'Close da extração' },
      { id: frames[2].id, position: 3, role: 'fechamento', headline: 'Peça pelo link', body: '', visualCue: 'Xícara servida' },
    ],
  });
  const draft = state.drafts[0];
  const anchorBlob = new Blob([pngBytes], { type: 'image/png' });
  const input = await prepareArtworkInput({
    proposal: {
      prompt: 'Close macro da extração em V60 com vapor suave',
      operation: 'create',
      baseImageId: null,
      referenceIds: [],
      format: 'collection',
      frameId: frames[1].id,
      frameIndex: 2,
    },
    draft,
    format: 'collection',
    referenceIds: [],
    loadAnchor: async id => id === frames[0].id ? { file: anchorBlob, metadata: { width: 10, height: 10 } } : null,
  });
  assert.equal(input.format, 'collection');
  assert.equal(input.frame?.position, 2);
  assert.equal(input.frame?.total, 3);
  assert.equal(input.frame?.visualInvariants, 'Luz natural quente pela esquerda, grão suave');
  assert.equal(input.images.length, 1);
  assert.equal(input.images[0].role, 'anchor');
  assert.equal(input.images[0].id, frames[0].id);
});

test('parallelExplorationContext propaga postFormat (story 9:16) e brandVoice para o planejador', async () => {
  const userId = uuid(1), projectId = uuid(2), pieceId = uuid(3);
  let state = createStudioState({ userId, projectId, projectIdea: 'Oficina de xilogravura' });
  state = updateBrandVoice(state, { tone: 'Artesanal e objetivo', examples: '', avoid: 'imperdível' });
  state = startPostPreparation(state, pieceId);
  state = updatePostPreparation(state, { name: 'Story convite', format: 'story' });
  state = completePostPreparation(state);
  const ctx = await parallelExplorationContext(
    state,
    projectId,
    pieceId,
    'Oficina de xilogravura',
    async () => Response.json({ signals: [] }),
  );
  assert.equal(ctx.postFormat, 'story');
  assert.equal(ctx.brandVoice?.avoid, 'imperdível');
});
