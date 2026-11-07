type ShownImage={id:string;ordinal:number};
const key=(projectId:string)=>`compor-shown-explorations:${projectId}`;
const valid=(item:unknown):item is ShownImage => Boolean(item && typeof item==='object' && 'id' in item && typeof item.id==='string' && /^[0-9a-f-]{36}$/i.test(item.id) && 'ordinal' in item && Number.isSafeInteger(item.ordinal) && Number(item.ordinal)>0);

export function readShownExplorations(projectId:string,storage:Pick<Storage,'getItem'>=sessionStorage):ShownImage[] {
  try { const value:unknown=JSON.parse(storage.getItem(key(projectId))??'[]');return Array.isArray(value)?value.filter(valid).slice(-500):[]; }
  catch {return [];}
}

export function rememberShownExplorations(projectId:string,images:ShownImage[],storage:Pick<Storage,'getItem'|'setItem'>=sessionStorage) {
  const byId=new Map(readShownExplorations(projectId,storage).map(image=>[image.id,image]));
  for(const image of images)if(valid(image))byId.set(image.id,image);
  storage.setItem(key(projectId),JSON.stringify([...byId.values()].slice(-500)));
}
