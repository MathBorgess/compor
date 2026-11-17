import type {VisualInputManifest,VisualReferenceImage} from './visual-input-contract.js';
export function visualInputDigest(value:unknown):string;
export function parseVisualInput(manifest:unknown,images:unknown):Readonly<{visualInput:VisualInputManifest;referenceImages:readonly VisualReferenceImage[]}>;
export function parseSelectedVisualInput(manifest:unknown,images:unknown,referenceIds:unknown):Readonly<{visualInput:VisualInputManifest;referenceImages:readonly VisualReferenceImage[]}>;
