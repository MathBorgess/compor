import { POST_FORMATS, isPostFormat } from './creative-skills/format-limits.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const proposalFields = ['prompt', 'operation', 'baseImageId', 'referenceIds', 'changedDimension', 'format', 'frameId', 'frameIndex'];

export const IMAGE_PROPOSAL_SCHEMA = /*#__PURE__*/Object.freeze({
  type: 'object',
  properties: {
    prompt: {type: 'string', minLength: 1, maxLength: 4000},
    operation: {type: 'string', enum: ['create', 'edit']},
    baseImageId: {type: ['string', 'null']},
    referenceIds: {type: 'array', items: {type: 'string'}, maxItems: 20},
    changedDimension: {type:'string',enum:['style','composition','hook'],description:'Declare a dimensão criativa alterada para criar uma variante. Omita em retoques que preservam o visual e a mensagem.'},
    format: {type:'string',enum:[...POST_FORMATS],description:'Formato do post: single (4:5), carousel (4:5), collection (4:5) ou story (9:16).'},
    frameId: {type:['string','null'],description:'UUID da lâmina alvo quando o post for carousel ou collection.'},
    frameIndex: {type:['integer','null'],minimum:1,maximum:10,description:'Posição (1..10) da lâmina alvo em carousel ou collection.'},
  },
  required: ['prompt', 'operation', 'baseImageId', 'referenceIds'],
  additionalProperties: false,
});

export function parseImageProposal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !proposalFields.includes(key)) ||
      typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 4000 ||
      /sk-[^\s]+/i.test(value.prompt)) throw Error('invalid_image_proposal');
  const operation = value.operation === undefined ? 'create' : value.operation;
  const baseImageId = value.baseImageId ?? null;
  const referenceIds = value.referenceIds === undefined ? [] : value.referenceIds;
  const changedDimension = value.changedDimension;
  const format = value.format;
  const frameId = value.frameId;
  const frameIndex = value.frameIndex;
  if (!['create', 'edit'].includes(operation) || !Array.isArray(referenceIds) || referenceIds.length > 20 ||
      referenceIds.some(id => !uuid(id)) || new Set(referenceIds).size !== referenceIds.length ||
      (operation === 'edit' ? !uuid(baseImageId) : baseImageId !== null) || referenceIds.includes(baseImageId) ||
      (changedDimension !== undefined && !['style', 'composition', 'hook'].includes(changedDimension)) ||
      (format !== undefined && !isPostFormat(format)) ||
      (frameId !== undefined && frameId !== null && !uuid(frameId)) ||
      (frameIndex !== undefined && frameIndex !== null && (!Number.isSafeInteger(frameIndex) || frameIndex < 1 || frameIndex > 10)))
    throw Error('invalid_image_proposal');
  const multiFrame = format === 'carousel' || format === 'collection';
  if (multiFrame && (frameId === undefined || frameId === null)) throw Error('invalid_image_proposal');
  if (!multiFrame && format !== undefined && (frameId !== undefined && frameId !== null || frameIndex !== undefined && frameIndex !== null)) throw Error('invalid_image_proposal');
  if ((frameIndex !== undefined && frameIndex !== null) && (frameId === undefined || frameId === null)) throw Error('invalid_image_proposal');
  return {
    prompt: value.prompt,
    operation,
    baseImageId,
    referenceIds: [...referenceIds],
    ...(changedDimension === undefined ? {} : {changedDimension}),
    ...(format === undefined ? {} : {format}),
    ...(frameId === undefined ? {} : {frameId}),
    ...(frameIndex === undefined ? {} : {frameIndex}),
  };
}

export function serializeImageProposal(value) {
  return JSON.stringify(parseImageProposal(value));
}
