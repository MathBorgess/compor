"use client";
import {useEffect,useState} from 'react';
import {z} from 'zod';

const draftSchema=z.string().max(4000).refine(value=>!/sk-[^\s]+/i.test(value));
/** Drafts are private to the tab and conversation, and never change a tool's revision. */
export function useConversationDraft(userId:string,projectId:string,conversationId:string) {
  const key=`compor-message-draft:v1:${userId}:${projectId}:${conversationId}`;
  const [record,setRecord]=useState({key:'',value:'',error:''});
  useEffect(()=>{
    try{const raw=sessionStorage.getItem(key);setRecord({key,value:raw===null?'':draftSchema.parse(JSON.parse(raw)),error:''});}
    catch{setRecord({key,value:'',error:'Não foi possível recuperar o texto desta conversa.'});}
  },[key]);
  function setValue(value:string) {
    if(!draftSchema.safeParse(value).success){setRecord({key,value,error:'O texto não pôde ser preservado. Confira seu conteúdo.'});return;}
    let error='';
    try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}
    catch{error='Este texto está somente na memória desta aba. Evite recarregar antes de enviá-lo.';}
    setRecord({key,value,error});
  }
  return {value:record.key===key?record.value:'',error:record.key===key?record.error:'',setValue};
}
