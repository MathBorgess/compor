/** Offline descriptive comparison on recorded candidates; no service calls. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../../../../docs/evals/2026-10-29-phoenix-e2e/',import.meta.url));
const cases=[
 ['Finanças','decision-mcp-evidence.json','48e49c75',[1,0,0,2,2,2,0,0,0]],
 ['Botânica','botanica-decision-evidence.json','1ca465a3',[2,1,0,0,1,1,2,0,0]],
 ['Reuniões','reunioes-decision-evidence.json','90200bb6',[1,0,2,1,2,2,0,0,0]],
 ['Marina','marina-decision-evidence.json','9daabb5f',[1,0,1,2,1,0,1,0,0]],
 ['Marina após SID','marina-after-sid-evidence.json','354d3f33',[1,1,1,0,0,1,1,1,1]],
];
const dcg=xs=>xs.reduce((a,x,i)=>a+(2**x-1)/Math.log2(i+2),0);
for(const [name,file,prefix,grades] of cases){
 const d=JSON.parse(readFileSync(dir+file,'utf8'));
 const results=d.decision_results??d.data.decision_score_batch.candidates;
 const ranking=d.ranking??d.data.candidates;
 const ids=grades.map((_,i)=>`phx_${prefix}_${String(i+1).padStart(2,'0')}`);
 if(results.length!==9||new Set(results.map(x=>x.candidate_id)).size!==9||results.some(x=>!ids.includes(x.candidate_id)||x.status!=='scored'||!Number.isFinite(x.score))) throw Error(`incomplete scores: ${file}`);
 const getGrades=order=>order.map(id=>{const i=ids.indexOf(id);if(i<0)throw Error(`unknown ${id}`);return grades[i]});
 const ideal=dcg([...grades].sort((a,b)=>b-a).slice(0,3));
 const metric=order=>{const g=getGrades(order.slice(0,3));if(g.length!==3||new Set(order.slice(0,3)).size!==3)throw Error('invalid top three');return {p3:g.filter(x=>x>=2).length/3,ndcg3:ideal?dcg(g)/ideal:null}};
 const actual=ranking.slice(0,3).map(x=>x.candidate_id);
 const scoreOnly=[...results].sort((a,b)=>b.score-a.score||a.candidate_id.localeCompare(b.candidate_id)).slice(0,3).map(x=>x.candidate_id);
 let pSum=0,nSum=0,n=0;
 for(const a of ids)for(const b of ids)for(const c of ids)if(a!==b&&a!==c&&b!==c){const x=metric([a,b,c]);pSum+=x.p3;nSum+=x.ndcg3??0;n++}
 console.log(JSON.stringify({case:name,recorded_top3:actual,recorded:metric(actual),decision_score_only_top3:scoreOnly,decision_score_only:metric(scoreOnly),uniform_random_expectation:{p3:pSum/n,ndcg3:ideal?nSum/n:null},permutations:n,useful:grades.filter(x=>x>=2).length}));
}
