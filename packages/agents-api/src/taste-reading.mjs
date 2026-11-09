const FIELD_LIMIT=1200;
// A '?' counts as a question only before whitespace, the end or a closing quote/bracket, so a URL query does not.
const questions=text=>text.match(/\?(?=$|[\s"'”’»)\]}])/g)?.length??0;

/** The selection-turn reply: a taste reading, a recommendation and one question, or null when the reply breaks that contract. */
export function parseTasteReading(text){
 if(typeof text!=='string')return null;
 const raw=text.trim(),fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw);
 let value;try{value=JSON.parse(fenced?fenced[1]:raw);}catch{return null;}
 // Extra keys from the model are ignored, not rendered: only the three fields reach the conversation.
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const reading={};
 for(const key of ['leitura','recomendacao','pergunta']){const field=typeof value[key]==='string'?value[key].trim():'';if(!field||field.length>FIELD_LIMIT)return null;reading[key]=field;}
 if(questions(reading.leitura)||questions(reading.recomendacao)||questions(reading.pergunta)!==1||!/\?["'”’»)\]}]*$/.test(reading.pergunta))return null;
 return reading;
}
export const tasteReadingMarkdown=({leitura,recomendacao,pergunta})=>`${leitura}\n\n**Recomendação:** ${recomendacao}\n\n${pergunta}`;
