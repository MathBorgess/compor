import React, {type ReactNode} from 'react';
import {parallelProgressSchema,type ParallelProgress} from '../lib/parallel-exploration-progress.ts';

const labels={unconfirmed:'Aguardando confirmação do lote',running:'Aguardando a imagem',unknown:'Resultado desconhecido',completed:'Imagem confirmada',rejected:'Envio recusado',quality_held:'Proposta retida pela revisão de qualidade',failed:'A imagem não chegou.'} as const;

/** Presentational only: it neither observes the server nor starts or repeats work. */
export function ParallelExplorationProgress({progress,renderConfirmedImage}:{progress:ParallelProgress;renderConfirmedImage?:(requestId:string)=>ReactNode}) {
  const value=parallelProgressSchema.parse(progress),completed=value.children.filter(item=>item.status==='completed').length;
  return <React.Fragment><section aria-label="Progresso das propostas">
    <p role="status">{completed} de 3 imagens confirmadas.</p>
    <ol>{[...value.children].sort((a,b)=>a.position-b.position).map(item=><li key={item.requestId}>
      <h3>Proposta {item.position}</h3>
      {item.status==='running'||item.status==='unconfirmed'
        ? <p className="studio-batch-wait"><img className="studio-batch-spinner" src="/studio/compor-avatar.svg" alt="" />{labels[item.status]}</p>
        : <p>{labels[item.status]}</p>}
      {item.status==='completed'&&renderConfirmedImage?.(item.requestId)}
    </li>)}</ol>
    {value.children.some(item=>item.status==='unknown')&&<p>Uma tentativa continua sem confirmação. Ela não será repetida automaticamente.</p>}
    {value.children.some(item=>item.status==='rejected')&&<p>Uma tentativa foi recusada. As outras propostas continuam preservadas.</p>}
    {value.children.some(item=>item.status==='quality_held')&&<p>Você pode pedir a reposição de uma proposta retida. As imagens confirmadas permanecem disponíveis.</p>}
    {completed===3&&value.wait.mode!=='none'&&<p>As três imagens foram confirmadas. Aguarde o intervalo antes de continuar.</p>}
  </section></React.Fragment>;
}
