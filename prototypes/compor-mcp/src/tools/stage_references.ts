import { z } from 'zod';
import {
  ImageSanitizationError,
  sanitize_and_stage_image,
} from '../security/image_sanitizer.js';
import {
  mapAttributesToPr9Aspects,
  type EphemeralReferenceStore,
  type Pr9CompatibleStagedReference,
  type ReferenceAttribute,
} from '../staging/ephemeral_store.js';
import { referenceAttributeSchema } from './search_references.js';

export const stageSelectionItemSchema = z.strictObject({
  ref_id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/)
    .describe('ID opaco retornado na busca.'),
  selected_attributes: z
    .array(referenceAttributeSchema)
    .min(1)
    .max(4)
    .describe('Atributos específicos aprovados pelo usuário (typography, composition, color, photography).'),
  user_notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe('Observações específicas do usuário sobre o que aproveitar ou evitar.'),
});

export const stageApprovedReferencesInputSchema = {
  proceed_without_references: z
    .boolean()
    .describe('True se o usuário rejeitou todas ou decidiu seguir apenas com a identidade visual.'),
  selections: z
    .array(stageSelectionItemSchema)
    .max(20)
    .describe('Lista de referências aprovadas e atributos selecionados.'),
};

export interface StageApprovedReferencesDependencies {
  store: EphemeralReferenceStore;
  fetchFn?: typeof globalThis.fetch;
}

export async function executeStageApprovedReferences(
  input: {
    proceed_without_references: boolean;
    selections: Array<{
      ref_id: string;
      selected_attributes: ReferenceAttribute[];
      user_notes?: string;
    }>;
  },
  deps: StageApprovedReferencesDependencies,
) {
  const sessionId = deps.store.getActiveSessionId();

  if (input.proceed_without_references) {
    await deps.store.clearSearchAndStaging(sessionId);
    deps.store.setProceedWithoutReferences(true);

    const emptyManifest = {
      status: 'proceeding_without_references' as const,
      session_id: sessionId,
      proceed_without_references: true,
      staged_count: 0,
      staged_references: [] as Pr9CompatibleStagedReference[],
      moodboard_elements: [],
      Temporary_search_cleared: true,
      next_step:
        'Pronto para compor a direção criativa (compose_creative_direction) utilizando apenas o briefing, o formato (PR 10) e a Identidade Visual.',
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(emptyManifest) }],
      structuredContent: emptyManifest,
    };
  }

  if (input.selections.length === 0) {
    const errPayload = {
      status: 'error' as const,
      code: 'empty_selections',
      message:
        'Nenhuma referência selecionada. Para seguir sem referências externas, defina proceed_without_references: true.',
    };
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(errPayload) }],
      structuredContent: errPayload,
    };
  }

  const seenIds = new Set<string>();
  for (const selection of input.selections) {
    if (seenIds.has(selection.ref_id)) {
      const dupPayload = {
        status: 'error' as const,
        code: 'duplicate_selection_ref_id',
        message: `Referência duplicada na seleção: ${selection.ref_id}.`,
      };
      return {
        isError: true,
        content: [{ type: 'text' as const, text: JSON.stringify(dupPayload) }],
        structuredContent: dupPayload,
      };
    }
    seenIds.add(selection.ref_id);
  }

  const stagedBatch: Array<{ record: Pr9CompatibleStagedReference; aliases: string[] }> = [];
  const newlyCreatedPaths: string[] = [];
  const existingStagedPaths = new Set(
    deps.store.listStagedReferences().map((ref) => ref.local_path),
  );
  const fetchFn = deps.fetchFn ?? ((url, init) => globalThis.fetch(url, init));

  for (const selection of input.selections) {
    const candidate = deps.store.getCandidate(selection.ref_id);
    if (!candidate) {
      const missingPayload = {
        status: 'error' as const,
        code: 'unknown_or_expired_ref_id',
        ref_id: selection.ref_id,
        message: `Referência ${selection.ref_id} não encontrada ou expirada no EphemeralReferenceStore.`,
      };
      return {
        isError: true,
        content: [{ type: 'text' as const, text: JSON.stringify(missingPayload) }],
        structuredContent: missingPayload,
      };
    }
  }

  for (const selection of input.selections) {
    const candidate = deps.store.getCandidate(selection.ref_id)!;

    try {
      const stagedImage = await sanitize_and_stage_image({
        session_id: candidate.session_id,
        ref_id: selection.ref_id,
        media_url: candidate.media_url,
        staging_root: deps.store.getStagingRoot(),
        fetch_fn: fetchFn,
      });
      if (!existingStagedPaths.has(stagedImage.local_path)) {
        newlyCreatedPaths.push(stagedImage.local_path);
      }

      const pr9Aspects = mapAttributesToPr9Aspects(selection.selected_attributes);
      const userNotes = selection.user_notes?.trim() ? selection.user_notes.trim() : null;
      const meaningSummary = [
        `Extrair exclusivamente [${selection.selected_attributes.join(', ')}] como inspiração.`,
        userNotes ? `Notas da pessoa: ${userNotes}` : null,
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, 300);

      const labelSummary = `Referência aprovada (${selection.selected_attributes.join(', ')})`.slice(0, 100);

      const stagedRecord: Pr9CompatibleStagedReference = {
        id: selection.ref_id,
        ref_id: selection.ref_id,
        kind: 'reference',
        value: null,
        asset_ref: selection.ref_id,
        label: labelSummary,
        meaning: meaningSummary,
        aspects: pr9Aspects,
        intent: 'inspire',
        priority: 1,
        origin_claim: 'user_approved_curated_reference',
        geometry: null,
        visual_role: 'client_described',

        origin_url: candidate.origin_url,
        source_id: candidate.source_id,
        selected_attributes: selection.selected_attributes,
        user_notes: userNotes,
        license_scope: 'inspiration_only',
        direct_publication_allowed: false,
        local_path: stagedImage.local_path,
        mime_type: 'image/webp',
        width_px: stagedImage.width_px,
        height_px: stagedImage.height_px,
        byte_length: stagedImage.byte_length,
        sha256: stagedImage.sha256,
        exif_stripped: true,
        magic_bytes_verified: true,
        stripped_metadata_segments: stagedImage.stripped_metadata_segments,
        untrusted_external_caption: candidate.untrusted_external_caption,
        external_metadata_envelope: candidate.untrusted_external_caption.envelope,
      };

      stagedBatch.push({ record: stagedRecord, aliases: candidate.aliases });
    } catch (error) {
      const { rm } = await import('node:fs/promises');
      for (const createdPath of newlyCreatedPaths) {
        try {
          await rm(createdPath, { force: true });
        } catch {
          // Ignore cleanup errors on partial failure
        }
      }
      const code =
        error instanceof ImageSanitizationError ? error.code : 'staging_failed';
      const errPayload = {
        status: 'error' as const,
        code,
        ref_id: selection.ref_id,
        message: error instanceof Error ? error.message : 'Falha ao sanitizar e salvar imagem.',
      };
      return {
        isError: true,
        content: [{ type: 'text' as const, text: JSON.stringify(errPayload) }],
        structuredContent: errPayload,
      };
    }
  }

  await deps.store.replaceStagedReferences(stagedBatch);
  const stagedReferences = stagedBatch.map((item) => item.record);
  deps.store.setProceedWithoutReferences(false);

  // Build PR 9 moodboard-compatible elements array
  const moodboardElements = stagedReferences.map((ref) => ({
    id: ref.id,
    kind: ref.kind,
    asset_ref: ref.asset_ref,
    label: ref.label,
    meaning: ref.meaning,
    aspects: ref.aspects,
    intent: ref.intent,
    priority: ref.priority,
    origin_claim: ref.origin_claim,
  }));

  const resultPayload = {
    status: 'staged' as const,
    session_id: sessionId,
    proceed_without_references: false,
    staged_count: stagedReferences.length,
    staged_references: stagedReferences,
    moodboard_elements: moodboardElements,
    pr9_contract_compatible: true,
    license_scope: 'inspiration_only' as const,
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(resultPayload) }],
    structuredContent: resultPayload,
  };
}
