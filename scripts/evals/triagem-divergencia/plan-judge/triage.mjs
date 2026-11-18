import {array,runGroup,schemaObject,str} from './group.mjs';

const grading=`Examine os pixels de referência da prancha de cada ficha e o pedido do criador. Cada R corresponde à imagem numerada com o mesmo R. O campo gold contém a expectativa sintética congelada antes das saídas; é o critério de avaliação e não uma saída. Leia os prompts que serão enviados ao gerador e, quando disponíveis, as interpretações declaradas. Para cada referência presente dê três notas independentes: intent para ligação da intenção do criador ao arquivo certo, characteristic para identificação da característica observável no arquivo correto (incluindo o que deve ficar de fora), use para a especificação de como e onde aplicar ou excluir essa característica nos prompts efetivos das três artes. Atribua 2 a algo específico e correto nas evidências, 1 a parcial, 0 a errado ou contradito. Para inferência oferecida como certeza ou elemento inventado, aponte o erro. Se não houver evidência para atribuir ao arquivo, use null. Quando faltarem leituras declaradas, um vínculo específico e inequívoco em um prompt ainda pode justificar nota. Uma simples menção do UUID ou presença do anexo não garante entendimento ou uso. Explicite a evidência por referência com trecho literal do plano/leitura, ou descreva a lacuna. Nomeie falhas por slot quando o uso for desigual; uma instrução em apenas uma das três artes não recebe 2 em uso. No caso recusado ou inutilmente redundante, omitir a referência pode ser o resultado correto. Considere sua função expressa na ficha. Classifique o que o plano demonstra. As imagens finais e custos são avaliados posteriormente. Em change, descreva uma mudança específica que poderia corrigir o maior problema observado ou uma escolha a conservar se o caso foi satisfatório.`;
const grade={type:['integer','null'],enum:[0,1,2,null]};
const refScore=schemaObject({ref:str,intent:grade,characteristic:grade,use:grade,evidence:str});
const schema=schemaObject({references:array(refScore),change:str});

export function judgeTriage(dir,rows,prepare=false) {
  const images=[];
  const cards=rows.map(row=>{
    if(!row.plan)return {alias:row.alias,data:null};
    const {context, visualInput, referenceImages, rubric}=row.packet;
    const refs=visualInput.entries.map((entry,index)=>{
      const truth=rubric.references.find(ref=>ref.id===entry.id);
      const sidecar=row.readings?.find(item=>item.referenceId===entry.id)??null;
      return {ref:'R'+(index+1),id:entry.id,source:entry.inputOrigin,selectedInPlan:row.plan.referenceIds.includes(entry.id),
        gold:{intent:truth.intent,attribute:truth.attribute,placement:truth.placement,forbidden:truth.forbidden,decision:truth.decision},
        recorded:sidecar};
    });
    const file=row.alias+'.png';
    if(refs.length)images.push({file,images:referenceImages.map(img=>img.data)});
    return {alias:row.alias,data:{briefing:context,sources:refs,strip:refs.length?file:null,
      items:row.plan.items.map(({position,prompt})=>({position,prompt}))}};
  });
  const results=runGroup({dir,cards,schema,instructions:grading,images,prepare});
  if(prepare)return null;
  return new Map(rows.map(row=>{
    if(!row.plan)return [row.id,{available:false,references:[],change:'Plano indisponível.'}];
    const observation=results.get(row.alias);
    const entries=row.packet.visualInput.entries;
    if(!Array.isArray(observation?.references)||observation.references.length!==entries.length||
      typeof observation.change!=='string'||!observation.change.trim())throw Error('incomplete_triage_review');
    const refs=entries.map((entry,index)=>{
      const ref=observation.references.find(item=>item.ref==='R'+(index+1));
      if(!ref||!['intent','characteristic','use'].every(k=>[null,0,1,2].includes(ref[k]))||
        typeof ref.evidence!=='string'||!ref.evidence.trim())throw Error('invalid_reference_judgment');
      const expected=row.packet.rubric.references.find(r=>r.id===entry.id).decision;
      const observed=row.plan.referenceIds.includes(entry.id)?'keep':'omit';
      return {referenceId:entry.id,...ref,expected,observed,correct:expected===observed};
    });
    return [row.id,{available:true,references:refs,change:observation.change}];
  }));
}
