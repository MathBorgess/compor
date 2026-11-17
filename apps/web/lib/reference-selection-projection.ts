import {sha256Hex} from './browser-bytes.ts';
import * as z from './schema.ts';
import type {StudioState} from './studio-domain.ts';
import type {ReferenceAuthorityWrite} from './reference-authority-client.ts';

const id=z.uuid();
const source=z.union([z.null(),z.strictObject({originUrl:z.string(),board:z.string()}),z.strictObject({projectId:id,imageId:id})]);
const entry=z.strictObject({id,inputOrigin:z.enum(['local-upload','external','generated']),source}).check(z.refine(value=>value.inputOrigin==='local-upload'?value.source===null:value.inputOrigin==='external'?value.source!==null&&'originUrl' in value.source:value.source!==null&&'imageId' in value.source));
const post=z.strictObject({pieceId:id,referenceIds:z.array(id).check(z.maxLength(20)),excludedReferenceIds:z.array(id).check(z.maxLength(20))});
export const referenceSelectionWriteSchema=z.strictObject({version:z.literal(1),references:z.array(entry).check(z.maxLength(500)),projectReferenceIds:z.array(id).check(z.maxLength(20)),posts:z.array(post).check(z.maxLength(500))});

/** Provenance absent from the local state remains unknown and is never backfilled. */
export function referenceSelectionProjection(state:StudioState):ReferenceAuthorityWrite {
 const references:ReferenceAuthorityWrite['references']=[];
 for(const reference of state.references){
  const source=reference.source;if(!source)continue;
  if('originUrl' in source)references.push({id:reference.id.toLowerCase(),inputOrigin:'external',source:{originUrl:source.originUrl,board:source.board}});
  else if(source.kind==='generated')references.push({id:reference.id.toLowerCase(),inputOrigin:'generated',source:{projectId:source.projectId.toLowerCase(),imageId:source.imageId.toLowerCase()}});
  else references.push({id:reference.id.toLowerCase(),inputOrigin:'local-upload',source:null});
 }
 const known=new Set(references.map(reference=>reference.id));
 const retain=(ids:readonly string[])=>ids.map(value=>value.toLowerCase()).filter(value=>known.has(value));
 const posts=Object.entries(state.posts).filter(([,value])=>!value.deleted).map(([pieceId,value])=>({pieceId:pieceId.toLowerCase(),referenceIds:retain(value.referenceIds),excludedReferenceIds:retain(value.excludedReferenceIds)})).filter(post=>post.referenceIds.length>0||post.excludedReferenceIds.length>0);
 return referenceSelectionWriteSchema.parse({version:1,references,projectReferenceIds:retain(state.projectReferenceIds),posts});
}

/** Same digest as SQL; it is a commitment to app-declared origin, not independent provenance. */
export async function referenceSelectionPublic(value:ReferenceAuthorityWrite){
 const state=referenceSelectionWriteSchema.parse(value);
 const references=[];
 for(const item of state.references){
  const digest=await sha256Hex(`compor-reference-source-v1\0${JSON.stringify({inputOrigin:item.inputOrigin,source:item.source})}`);
  references.push({id:item.id,inputOrigin:item.inputOrigin,sourceDigest:digest});
 }
 return {version:1 as const,references,projectReferenceIds:state.projectReferenceIds,posts:state.posts};
}
