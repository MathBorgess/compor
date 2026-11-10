import type {JsonSchema} from './contracts.js';
export type ChangedDimension='style'|'composition'|'hook';
export type ImageProposal = {prompt:string;referenceIds:string[];changedDimension?:ChangedDimension} & ({operation:'create';baseImageId:null} | {operation:'edit';baseImageId:string});
export const IMAGE_PROPOSAL_SCHEMA: JsonSchema;
export function parseImageProposal(value: unknown): ImageProposal;
export function serializeImageProposal(value: unknown): string;
