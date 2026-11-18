// Synthetic titles and labels fixed before ranking. IDs are fictional.
// Entries represent metadata only. No remote asset is requested or judged.
export const standardBoard = 'behance/typography';
const preferredBoard = 'weandthecolor/typography';
const classroom = [
  ['111', 'Oficina de cerâmica: passo a passo na roda'],
  ['112', 'Aula de esmaltação em cerâmica: mãos e detalhes'],
  ['113', 'Cartaz editorial sobre modelagem em argila'],
  ['114', 'Horários das aulas: hierarquia para iniciantes'],
  ['115', 'Convite para festa com texturas de glitter'],
  ['116', 'Oferta relâmpago de tênis de corrida'],
];
const oldHistory = Array.from({length: 12}, (_, index) => ({
  id: String(801 + index), title: 'Campanha anterior de moda praia ' + (index + 1),
  approvedVersions: 1, day: index + 1,
}));
export const cases = [
  {
    id: 'R1', brief: 'Oficina de cerâmica para iniciantes: aulas de modelagem em argila.',
    need: 'Exemplos do gesto artesanal, da aula ou de sua organização para iniciantes.',
    feeds: {[standardBoard]: classroom}, useful: ['111','112','113','114'],
  },
  {
    id: 'R2', brief: 'Arte para vender com luz de janela: fotos e narrativa de ateliê.',
    need: 'Mostrar a obra ou o processo real de quem vende arte. O material descartado por outras indústrias é irrelevante.',
    feeds: {[standardBoard]: [
      ['211','Guia para descarte com rastreio de componentes'],
      ['212','Transporte para linha de montagem com inspeção'],
      ['213','Sinalização para descarte com regras de coleta'],
      ['214','Manual de descarte para laboratórios com prazos'],
      ['215','Luz de janela nos retratos de artistas'],
      ['216','Ateliê aberto: sequência da obra ao acabamento'],
      ['217','Catálogo de arte: aproximação da textura'],
      ['218','Narrativa em imagens do artista no estúdio'],
    ]}, useful: ['215','216','217','218'],
  },
  {
    id: 'R3', brief: 'Curso de lettering. Quero cartazes calmos com letras desenhadas à mão.',
    need: 'Buscar composição de cartaz artesanal com espaço e ritmo. A conta tem escolha anterior no board de tipografia e recusou a versão neon neste projeto.',
    selectedBoard: preferredBoard, rejected: '311',
    feeds: {
      [preferredBoard]: [
        ['311','Curso de lettering com letras neon em cartazes'],
        ['312','Cartazes calmos: letras à mão em preto e branco'],
        ['313','Lettering artesanal: ritmo entre linhas de um cartaz'],
        ['314','Cartazes desenhados a lápis com espaço livre'],
        ['315','Aquecimento de letras com pincel para iniciantes'],
      ],
      [standardBoard]: [['316','Dashboard de logística para conferência de estoque']],
    }, useful: ['312','313','314','315'],
  },
  {
    id: 'R4', brief: 'Oficina de cerâmica: modelagem em argila para iniciantes.',
    need: 'Encontrar uma referência nova sobre a oficina. Doze referências antigas aprovadas sobre moda praia estão preservadas no histórico.',
    history: oldHistory, feeds: {[standardBoard]:classroom}, useful: ['111','112','113','114'],
  },
  {
    id: 'R5', brief: 'Infográfico para LinkedIn com indicadores de retenção de clientes B2B.',
    need: 'Comparar retenção entre períodos e apoiar a leitura do indicador pelo gestor.',
    feeds: {'hubspot/marketing-infographics': [
      ['511','Infográfico LinkedIn: retenção B2B por coorte'],
      ['512','Indicadores de clientes: cartões com evolução mensal'],
      ['513','Faixas temporais para comparar períodos'],
      ['514','Churn em pequenos múltiplos com legenda comum'],
      ['515','Convite para festival com ilustração decorativa'],
      ['516','Especial de cinema: entrevista com elenco'],
    ]}, useful: ['511','512','513','514'],
  },
  {id:'R6', brief:'Cartazes de astronomia.',need:'Caminho de busca vazia.',feeds:{},useful:[]},
  {id:'R7', brief:'Cadernos de desenho.',need:'Caminho de indisponibilidade da fonte.',feeds:{},unavailable:true,useful:[]},
];

// Reserved before implementing the discovery change. Includes a duplicate from the
// history and an explicit rejection so freeing slots cannot reward either one.
export const heldOut = {
  id: 'R8', brief: 'Aula de xilogravura: matriz, entalhe e impressão.',
  need: 'Descobrir técnicas e etapas visuais de xilogravura entre sugestões novas.',
  history: Array.from({length:15}, (_,index)=>({
    id:String(901+index), title:'Cartaz anterior de jazz ' + (index+1), approvedVersions:index%2, day:index+1,
  })),
  rejected:'920',
  feeds:{[preferredBoard]:[
    ['901','Aula de xilogravura já escolhida no histórico'],
    ['920','Xilogravura anteriormente recusada'],
    ['921','Xilogravura: preparar a matriz e escolher a madeira'],
    ['922','Entalhe em sequência, da linha ao relevo'],
    ['923','Impressão em papel: como levantar a primeira prova'],
    ['924','Aula ilustrada de aplicação de tinta com rolo'],
  ]},
  useful:['921','922','923','924'],
};
