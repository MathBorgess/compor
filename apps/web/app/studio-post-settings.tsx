"use client";
import {useId,type ChangeEvent} from 'react';
import type {PostContext} from '../lib/studio-domain';
export default function PostSettings({value,legacyAction,onChange,preparing=false}:{value:PostContext;legacyAction:string;onChange:(patch:Partial<PostContext>)=>void;preparing?:boolean}) {
  const id=useId();
  return <section className="guided-post-context"><p>{preparing?'Estas informações valem apenas para este post.':'Vale só para os próximos pedidos deste post. Tema, público geral e marca ficam no projeto. As versões existentes são preservadas.'}</p>
    {([['objective','Objetivo deste post','Ex.: live gratuita, venda ou autoridade',1],['message','O que este post deve comunicar?','Ou explique na conversa.',4],['action','Chamada para ação (opcional)','Ex.: inscreva-se na live.',2]] as const).map(([field,label,placeholder,rows])=>{
      const props={id:`${id}-${field}`,maxLength:4000,value:value[field],placeholder,onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>onChange({[field]:event.target.value})};
      return <div key={field}><label htmlFor={props.id}>{label}</label>{field==='objective'?<input {...props}/>:<textarea {...props} rows={rows}/>}</div>;
    })}
    {legacyAction&&<details><summary>Ação anterior</summary><p>{legacyAction}</p><button type="button" className="studio-button-secondary" onClick={()=>onChange({action:legacyAction})}>Usar neste post</button></details>}

  </section>;
}
