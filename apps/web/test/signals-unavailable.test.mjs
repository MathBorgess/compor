import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceSignalsRoute} from '../lib/reference-exploration-route.ts';
import {createGeneratedFeedbackRoute} from '../lib/generated-feedback-route.ts';
import {createReferenceSignalStore} from '../lib/reference-signal-store.ts';
import {createGeneratedFeedbackStore} from '../lib/generated-feedback-store.ts';

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origin='http://localhost:3000',projectId=id(1),pieceId=id(2);
const actor={userId:id(3),token:'verified-session-token'};
const reference={id:id(4),projectId,pieceId,originUrl:'https://www.pinterest.com/pin/123/',board:'behance/typography',action:'selected',comment:'',supersedes:null};
const generated={id:id(5),projectId,pieceId,imageId:id(6),action:'selected',comment:'',supersedes:null};
const request=body=>new Request(`${origin}/api/studio/signals`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const missingColumn=()=>Response.json({code:'42703',message:'column piece_id does not exist'},{status:400});

for(const {name,createRoute,createStore,input} of [
  {name:'references',createRoute:createReferenceSignalsRoute,createStore:createReferenceSignalStore,input:reference},
  {name:'explorations',createRoute:createGeneratedFeedbackRoute,createStore:createGeneratedFeedbackStore,input:generated},
]) {
  test(`${name}: esquema sem piece_id retorna 503 na leitura e não expõe erro do banco`,async()=>{
    const calls=[];
    const route=createRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>true,
      store:authorized=>createStore({config:{key:'public',service:'https://db.example'},actor:authorized,
        fetchApi:async(url,options)=>{calls.push({url:new URL(url),options});return missingColumn();}})});
    const response=await route(request({projectId,pieceId,scope:'project'}));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'unavailable'});
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(calls.length,1);
    assert.match(calls[0].url.searchParams.get('select'),/\bpiece_id\b/);
    assert.equal(calls[0].url.searchParams.get('piece_id'),`eq.${pieceId}`);
    assert.equal(calls[0].options.headers.authorization,`Bearer ${actor.token}`);
  });

  test(`${name}: esquema sem piece_id retorna 503 na gravação e não confirma sinal`,async()=>{
    const calls=[];
    const route=createRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>true,
      store:authorized=>createStore({config:{key:'public',service:'https://db.example'},actor:authorized,
        fetchApi:async(url,options)=>{calls.push({url:new URL(url),options});return missingColumn();}})});
    const response=await route(request(input));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'unavailable'});
    assert.equal(calls.length,1);
    assert.equal(calls[0].options.method,'POST');
    assert.equal(JSON.parse(calls[0].options.body).piece_id,pieceId);
    assert.equal(calls[0].options.headers.authorization,`Bearer ${actor.token}`);
  });

  test(`${name}: projeto não autorizado impede acesso ao REST mesmo diante de esquema ausente`,async()=>{
    let calls=0;
    const route=createRoute({appOrigin:origin,resolveActor:async()=>actor,ownsProject:async()=>false,
      store:authorized=>createStore({config:{key:'public',service:'https://db.example'},actor:authorized,
        fetchApi:async()=>{calls++;return missingColumn();}})});
    const response=await route(request({projectId,pieceId,scope:'project'}));
    assert.equal(response.status,404);
    assert.equal(calls,0);
  });
}
