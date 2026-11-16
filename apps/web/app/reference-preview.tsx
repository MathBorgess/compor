"use client";
import {useState} from 'react';
import StudioDialog from './studio-dialog';
export default function ReferencePreview({src,title,external=false}:{src:string;title:string;external?:boolean}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="reference-image-preview" aria-label={`Ampliar referência: ${title}`} onClick={()=>setOpen(true)}><img src={src} alt={title} referrerPolicy={external?'no-referrer':undefined} loading="lazy"/></button>{open&&<StudioDialog title={title} className="reference-image-dialog" closeLabel="Fechar imagem ampliada" onClose={()=>setOpen(false)}><img src={src} alt={title} referrerPolicy={external?'no-referrer':undefined}/></StudioDialog>}</>;
}
