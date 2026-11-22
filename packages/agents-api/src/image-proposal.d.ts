import type {JsonSchema} from './contracts.js';
import type {PostFormat} from './creative-skills/index.js';
export type ChangedDimension='style'|'composition'|'hook';
export type ImageProposal = {
  prompt:string;
  referenceIds:string[];
  changedDimension?:ChangedDimension;
  format?:PostFormat;
  frameId?:string|null;
  frameIndex?:number|null;
} & ({operation:'create';baseImageId:null} | {operation:'edit';baseImageId:string});
export const IMAGE_PROPOSAL_SCHEMA: JsonSchema;
export function parseImageProposal(value: unknown): ImageProposal;
export function serializeImageProposal(value: unknown): string;
