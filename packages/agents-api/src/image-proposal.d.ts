import type {JsonSchema} from './contracts.js';
export type ImageProposal = {prompt:string;referenceIds:string[]} & ({operation:'create';baseImageId:null} | {operation:'edit';baseImageId:string});
export const IMAGE_PROPOSAL_SCHEMA: JsonSchema;
export function parseImageProposal(value: unknown): ImageProposal;
export function serializeImageProposal(value: unknown): string;
