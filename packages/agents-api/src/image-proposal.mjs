const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const IMAGE_PROPOSAL_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    prompt: {type: 'string', minLength: 1, maxLength: 4000},
    operation: {type: 'string', enum: ['create', 'edit']},
    baseImageId: {type: ['string', 'null']},
    referenceIds: {type: 'array', items: {type: 'string'}, maxItems: 20},
  },
  required: ['prompt', 'operation', 'baseImageId', 'referenceIds'],
  additionalProperties: false,
});

export function parseImageProposal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !Object.hasOwn(IMAGE_PROPOSAL_SCHEMA.properties, key)) ||
      typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 4000 ||
      /sk-[^\s]+/i.test(value.prompt)) throw Error('invalid_image_proposal');
  const operation = value.operation === undefined ? 'create' : value.operation;
  const baseImageId = value.baseImageId ?? null;
  const referenceIds = value.referenceIds === undefined ? [] : value.referenceIds;
  if (!['create', 'edit'].includes(operation) || !Array.isArray(referenceIds) || referenceIds.length > 20 ||
      referenceIds.some(id => !uuid(id)) || new Set(referenceIds).size !== referenceIds.length ||
      (operation === 'edit' ? !uuid(baseImageId) : baseImageId !== null) || referenceIds.includes(baseImageId))
    throw Error('invalid_image_proposal');
  return {prompt: value.prompt, operation, baseImageId, referenceIds: [...referenceIds]};
}

export function serializeImageProposal(value) {
  return JSON.stringify(parseImageProposal(value));
}
