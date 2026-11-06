import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedArtworkFields } from '../lib/studio-editor-fields.ts';

const brief=offer=>({offer,audience:'',action:'',direction:''});
const content={headline:'',price:'',date:'',caption:'',captionOrigin:'user'};
test('sugere campos adequados ao briefing sem inventar valores',()=>{
 assert.deepEqual(suggestedArtworkFields(brief('Divulgar minha plataforma'),content),[]);
 assert.deepEqual(suggestedArtworkFields(brief('Anunciar oficina ao vivo com ingresso'),content),['price','date']);
 assert.deepEqual(suggestedArtworkFields(brief('Informar preço e data de lançamento'),content),['price','date']);
 assert.deepEqual(content,{headline:'',price:'',date:'',caption:'',captionOrigin:'user'});
});
test('dados preenchidos continuam visíveis mesmo quando o briefing muda',()=>{
 assert.deepEqual(suggestedArtworkFields(brief('Divulgar plataforma'),{...content,price:'R$ 40',date:'20/11'}),['price','date']);
 assert.deepEqual(suggestedArtworkFields(brief('Divulgar plataforma'),{...content,date:'20/11'}),['date']);
});
