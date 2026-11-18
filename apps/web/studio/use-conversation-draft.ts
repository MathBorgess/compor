"use client";
import {useState} from 'react';
import * as z from '../lib/schema.ts';

const draftSchema=z.string().check(z.maxLength(4000)).check(z.refine(value=>!/sk-[^\s]+/i.test(value)));
/** Drafts are private to the tab and conversation, and never change a tool's revision. */
export function useConversationDraft(userId:string,projectId:string,conversationId:string) {
  const key=`compor-message-draft:v1:${userId}:${projectId}:${conversationId}`;
  // StudioChat remounts per user, project and conversation, after the session is known.
  const [record,setRecord]=useState(()=>{
    try {
      const raw=typeof window==='undefined'?null:window.sessionStorage.getItem(key);
      return {value:raw===null?'':draftSchema.parse(JSON.parse(raw)),error:''};
    } catch { return {value:'',error:'Não foi possível recuperar o texto desta conversa.'}; }
  });
  function setValue(value:string) {
    if(!draftSchema.safeParse(value).success){setRecord({value,error:'O texto não pôde ser preservado. Confira seu conteúdo.'});return;}
    let error='';
    try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}
    catch{error='Este texto está somente na memória desta aba. Evite recarregar antes de enviá-lo.';}
    setRecord({value,error});
  }
  return {...record,setValue};
}
