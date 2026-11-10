const FIELD_LIMIT=1200;
export const TASTE_REPLY_VERSION=1;
export const TASTE_REPLY_LIMITS=Object.freeze({synthesis:80,label:40,description:140,alternatives:2});
const FIXED_LABELS=Object.freeze({agree:'Concordo',adjust:'Quero ajustar'});
// Exempt the query separator in HTTP(S) links with query parameters, then count
// every remaining question mark, including punctuation and Markdown boundaries.
const questions=text=>text.replace(/\bhttps?:\/\/[^\s<>"'`()\]{}*]+/gi,link=>link.replace(/\?(?=[\p{L}\p{N}_~%+.-])/u,'')).match(/\?/g)?.length??0;
// Option text is rendered as plain text next to a button. It cannot carry
// questions, links, Markdown/HTML punctuation, control characters or secrets.
function shortText(value,limit){
 if(typeof value!=='string')return null;
 const text=value.trim();
 if(!text||text.length>limit||/[\u0000-\u001f\u007f-\u009f<>*_`#[\]|\\?{}]/u.test(text)||/https?:|www\.|sk-/i.test(text))return null;
 return text;
}
/** The optional options object never invalidates a valid reading: any defect drops it entirely. */
function parseOptions(value){
 if(value===undefined||!value||typeof value!=='object'||Array.isArray(value))return {};
 const options={};
 if(value.sintese!==undefined){const synthesis=shortText(value.sintese,TASTE_REPLY_LIMITS.synthesis);if(!synthesis)return {};options.sintese=synthesis;}
 if(value.alternativas!==undefined){
  const list=value.alternativas;
  if(!Array.isArray(list)||list.length>TASTE_REPLY_LIMITS.alternatives)return {};
  const labels=new Set(Object.values(FIXED_LABELS).map(label=>label.toLocaleLowerCase('pt-BR')));
  const alternatives=[];
  for(const item of list){
   if(!item||typeof item!=='object'||Array.isArray(item))return {};
   const rotulo=shortText(item.rotulo,TASTE_REPLY_LIMITS.label),descricao=shortText(item.descricao,TASTE_REPLY_LIMITS.description);
   if(!rotulo||!descricao||labels.has(rotulo.toLocaleLowerCase('pt-BR')))return {};
   labels.add(rotulo.toLocaleLowerCase('pt-BR'));alternatives.push({rotulo,descricao});
  }
  if(alternatives.length)options.alternativas=alternatives;
 }
 return options;
}

/** The selection-turn reply: a taste reading, a recommendation and one question, or null when the reply breaks that contract. */
export function parseTasteReading(text){
 if(typeof text!=='string')return null;
 const raw=text.trim(),fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
 let value;try{value=JSON.parse(fenced?fenced[1]:raw);}catch{return null;}
 // Extra keys from the model are ignored, not rendered: only the three fields
 // and the validated options object reach the conversation.
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const reading={};
 for(const key of ['leitura','recomendacao','pergunta']){const field=typeof value[key]==='string'?value[key].trim():'';if(!field||field.length>FIELD_LIMIT)return null;reading[key]=field;}
 if(questions(reading.leitura)||questions(reading.recomendacao)||questions(reading.pergunta)!==1||!/\?["'”’»)\]}]*$/.test(reading.pergunta))return null;
 const options=parseOptions(value.opcoes);
 return Object.keys(options).length?{...reading,opcoes:options}:reading;
}
export const tasteReadingMarkdown=({leitura,recomendacao,pergunta})=>`${leitura}\n\n**Recomendação:** ${recomendacao}\n\n${pergunta}`;

/** Versioned, closed reply contract for the interface. The application owns
 * agree/adjust; the model may only name up to two taste alternatives. No option
 * maps to a tool, an approval or a generation request. */
export function tasteReadingReply(reading){
 const {leitura,recomendacao,pergunta,opcoes={}}=reading;
 return {version:TASTE_REPLY_VERSION,kind:'taste_reading',reading:leitura,recommendation:recomendacao,question:pergunta,
  ...(opcoes.sintese?{synthesis:opcoes.sintese}:{}),
  options:[
   {id:'agree',intent:'agree',label:FIXED_LABELS.agree},
   ...(opcoes.alternativas??[]).map((item,index)=>({id:`prefer_${index+1}`,intent:'prefer',label:item.rotulo,description:item.descricao})),
   {id:'adjust',intent:'adjust',label:FIXED_LABELS.adjust},
  ]};
}
