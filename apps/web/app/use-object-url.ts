'use client';

import {useEffect,useRef,useState} from 'react';
import {releaseObjectUrl} from './release-object-url.ts';

/** Revoke only after React has committed a newer URL, or the owner has unmounted. */
export function useObjectUrl(blob:Blob|null):string|null{
  const [current,setCurrent]=useState<{blob:Blob;url:string;generation:number}|null>(null);
  const resources=useRef(new Map<string,number>()),generation=useRef(0),cleanup=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{
    if(cleanup.current!==null){clearTimeout(cleanup.current);cleanup.current=null;}
    return()=>{cleanup.current=setTimeout(()=>{for(const url of resources.current.keys())releaseObjectUrl(url);resources.current.clear();},0);};
  },[]);
  useEffect(()=>{
    if(!blob){setCurrent(null);return;}
    const next=++generation.current,url=URL.createObjectURL(blob);resources.current.set(url,next);setCurrent({blob,url,generation:next});
  },[blob]);
  useEffect(()=>{
    if(!current&&blob)return;
    const before=current?.generation??generation.current+1;
    for(const [url,version] of resources.current)if(version<before){releaseObjectUrl(url);resources.current.delete(url);}
  },[current,blob]);
  return current?.blob===blob?current.url:null;
}
