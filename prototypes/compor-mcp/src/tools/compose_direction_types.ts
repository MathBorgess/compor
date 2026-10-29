import type {
  EphemeralReferenceStore,
  Pr9CompatibleStagedReference,
  ReferenceAttribute,
} from '../staging/ephemeral_store.js';

export const ALL_REFERENCE_ATTRIBUTES: readonly ReferenceAttribute[] = [
  'typography',
  'composition',
  'color',
  'photography',
] as const;

export type {
  EphemeralReferenceStore,
  Pr9CompatibleStagedReference,
  ReferenceAttribute,
};
