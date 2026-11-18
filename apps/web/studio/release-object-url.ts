'use client';

// React may suspend effects while keeping their DOM. Defer revocation until
// every image has released the URL, without polling or retaining unused URLs.
const pending=new Map<string,MutationObserver>();
export function releaseObjectUrl(url:string):void{
  if(pending.has(url))return;
  const used=()=>Array.from(document.images).some(image=>image.src===url);
  if(!used()){URL.revokeObjectURL(url);return;}
  const observer=new MutationObserver(()=>{if(!used()){observer.disconnect();pending.delete(url);URL.revokeObjectURL(url);}});
  pending.set(url,observer);observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  if(!used()){observer.disconnect();pending.delete(url);URL.revokeObjectURL(url);}
}
