import type {ReactNode} from 'react';
import {parallelProgressSchema,type ParallelProgress} from '../lib/parallel-exploration-progress.ts';

const labels={unconfirmed:'Aguardando confirmação do lote',running:'Resultado ainda não confirmado',unknown:'Resultado desconhecido',completed:'Imagem confirmada',rejected:'Envio recusado'} as const;

/** Presentational only: it neither observes the server nor starts or repeats work. */
export function ParallelExplorationProgress({progress,renderConfirmedImage}:{progress:ParallelProgress;renderConfirmedImage?:(requestId:string)=>ReactNode}) {
  const value=parallelProgressSchema.parse(progress),completed=value.children.filter(item=>item.status==='completed').length;
  return <section aria-label="Progresso das propostas">
    <p role="status">{completed} de 3 imagens confirmadas.</p>
    <ol>{[...value.children].sort((a,b)=>a.position-b.position).map(item=><li key={item.requestId}>
      <h3>Proposta {item.position}</h3>
      <p>{labels[item.status]}</p>
      {item.status==='completed'&&renderConfirmedImage?.(item.requestId)}
    </li>)}</ol>
    {value.children.some(item=>item.status==='unknown')&&<p>Uma tentativa continua sem confirmação. Ela não será repetida automaticamente.</p>}
    {value.children.some(item=>item.status==='rejected')&&<p>Uma tentativa foi recusada. As outras propostas continuam preservadas.</p>}
    {completed===3&&value.wait.mode!=='none'&&<p>As três imagens foram confirmadas. Aguarde o intervalo antes de continuar.</p>}
  </section>;
}
