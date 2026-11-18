import {cases,standardBoard} from './cases.mjs';
const restored=cases.filter(item=>['R1','R2','R4'].includes(item.id));
export const scenarios=[...restored,
  {id:'R9',brief:'Oficina de bicicleta: mostre o antes e depois do reparo de um freio.',need:'Quero enxergar o problema, o conserto ou o contraste antes/depois de uma bicicleta. Já recusei o cartaz de propaganda neon.',rejected:'491',feeds:{[standardBoard]:[
    ['491','Oficina de bicicleta: propaganda neon do serviço'],['492','Bicicleta: antes e depois da troca do cabo de freio'],['493','Sequência de fotos do reparo de freio'],['494','Freio de bicicleta: como mostrar o desgaste da sapata'],['495','Comparativo visual da peça antiga e substituída em oficina'],['496','Concurso de cartaz para uma cidade costeira'],['497','Manual de iluminação para retrato de estúdio'],
  ]}},
  {id:'R10',brief:'Biblioteca de sementes: convite para troca de sementes e identificação das plantas em envelopes.',need:'Referências para o convite da troca ou para a identificação botânica dos envelopes. Um envelope antigo já está no histórico.',history:[{id:'501',title:'Etiqueta de envelope já escolhida',approvedVersions:0,day:1}],feeds:{[standardBoard]:[
    ['501','Etiqueta de envelope já escolhida'],['502','Troca de sementes: convite ilustrado para feira do bairro'],['503','Cartela botânica: identificar as plantas pelo desenho'],['504','Envelopes com os nomes das sementes e época de plantio'],['505','Biblioteca comunitária de sementes: cartaz da troca'],['506','Gestão de acervo digital em biblioteca jurídica'],['507','Envelope de cobrança impresso para banco'],
  ]}},
];
