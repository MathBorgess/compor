import type {ImageProposal} from './image-proposal.js';
export interface ArtworkImage {id:string;role:'base'|'reference';mime:'image/png'|'image/jpeg';data:string}
export interface ArtworkInput {literalText:{headline:string;price:string;date:string;fields?:{id:string;label:string;value:string;origin:'user'|'agent'}[]};source:{pieceId:string;version:number}|null;images:ArtworkImage[]}
export const MAX_ARTWORK_REQUEST_BYTES: number;
export const MAX_ARTWORK_IMAGE_BYTES: number;
export function parseArtworkInput(value?:unknown):ArtworkInput;
export function imageProposalDigest(value:unknown):string;
export function artworkInputDigest(value:unknown):string;
export function validateArtworkForProposal(proposal:unknown,input:unknown):{proposal:ImageProposal;input:ArtworkInput};
export function compileArtworkPrompt(proposal:unknown,input:unknown):string;
