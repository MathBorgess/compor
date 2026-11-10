import type {ChangedDimension} from '@compor/agents-api/image-proposal';

type VariantVersion={piece_id:string;version:number;metadata?:{baseVersion?:number|null;changedDimension?:ChangedDimension|null}};
export type VariantGroup<T extends VariantVersion>={root:T;latest:T;versions:T[];dimension:ChangedDimension|null};

/** Creative dimensions open branches; retouches follow their declared base. */
export function groupVariants<T extends VariantVersion>(versions:readonly T[],pieceId:string):VariantGroup<T>[] {
  const ordered=versions.filter(item=>item.piece_id===pieceId).toSorted((a,b)=>a.version-b.version);
  const groups:VariantGroup<T>[]=[];
  const byVersion=new Map<number,VariantGroup<T>>();
  for(const version of ordered){
    let group=version.metadata?.changedDimension?undefined:byVersion.get(version.metadata?.baseVersion??0);
    if(!groups.length||version.metadata?.changedDimension){
      group={root:version,latest:version,versions:[],dimension:version.metadata?.changedDimension??null};
      groups.push(group);
    }else group??=groups[0];
    group.versions.push(version);group.latest=version;byVersion.set(version.version,group);
  }
  return groups;
}
