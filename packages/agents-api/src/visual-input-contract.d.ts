export type VisualMime = 'image/png'|'image/jpeg';
export type VisualFileDescriptor = Readonly<{sha256:string;mime:VisualMime;byteLength:number}>;
export type VisualInputEntry = Readonly<{id:string;ordinal:number;role:'reference';inputOrigin:'local-upload';original:VisualFileDescriptor;transport:VisualFileDescriptor & Readonly<{width:number;height:number}>;transformation:'none'|'optimized-v1'}>;
export type LocalVisualInputManifest = Readonly<{version:1;policy:'optimized-v1';entries:readonly VisualInputEntry[]}>;
export type VisualSelectionEntry = Omit<VisualInputEntry,'inputOrigin'> & (
 Readonly<{inputOrigin:'local-upload';source:null}> |
 Readonly<{inputOrigin:'external';source:Readonly<{originUrl:string;board:string}>}> |
 Readonly<{inputOrigin:'generated';source:Readonly<{projectId:string;imageId:string}>}>
);
export type VisualSelectionManifest = Readonly<{version:2;policy:'optimized-v1';externalConsent:boolean;entries:readonly VisualSelectionEntry[]}>;
export type VisualInputManifest = LocalVisualInputManifest|VisualSelectionManifest;
export type VisualReferenceImage = Readonly<{id:string;mime:VisualMime;data:string}>;
export const MAX_VISUAL_IMAGES:number;
export const MAX_VISUAL_IMAGE_BYTES:number;
export const MAX_VISUAL_IMAGE_URL_CHARS:number;
export const MAX_VISUAL_TRANSPORT_FILE_BYTES:number;
export const MAX_VISUAL_SOURCE_BYTES:number;
export const MAX_VISUAL_REQUEST_BYTES:number;
export const MAX_VISUAL_DIMENSION:number;
export const MAX_VISUAL_PIXELS:number;
export function validateVisualInputManifest(value:unknown):value is VisualInputManifest;
export function parseVisualInputManifest(value:unknown):VisualInputManifest;
export function validateVisualReferenceSelection(manifest:unknown,referenceIds:unknown):referenceIds is string[];
export function visualInputMatchesProject(manifest:unknown,projectId:string):boolean;
