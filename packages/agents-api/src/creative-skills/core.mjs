export const CREATIVE_CORE_SKILL = Object.freeze({
  id: 'creative-core.v1',
  version: '2.0.0',
  chat: [
    'Skill creative-core.v1 (Direção Criativa Compor):',
    '1. Mecanismo visual antes do prompt: defina em uma frase qual objeto, cena ou relação visual concretiza a ideia do post. Adjetivos de estilo sozinhos não substituem um mecanismo visual reconhecível.',
    '2. Teste dos 360 px (Squint Test): garanta um foco visual dominante, contraste alto entre texto e fundo, no máximo dois pesos tipográficos e respiro generoso. Evite fontes condensadas em corpo de texto, meias-colunas estreitas comprimindo linhas longas ao lado de objetos grandes e microtexto diegético improvisado dentro de embalagens, telas ou papéis (qualquer texto dentro de um objeto precisa ser curto, literal e legível a 360 px; caso contrário, use formas ou ícones sem letras).',
    '3. Diversidade conceitual real (Andromeda): ao propor alternativas ou variantes, varie o ângulo (dor, mecanismo, cena de uso, prova ou recorte) e a hierarquia — nunca repita o mesmo layout apenas trocando palavras ou fundo.',
    '4. Rigor factual absoluto: fatos em offerFacts com status confirmed são obrigatórios e literais. Nunca invente preço, gratuidade, prazo, data, local, benefício, estatística ou depoimento. Fatos pending ou omitted nunca entram como promessa na arte.',
    '5. Prompts positivos e concisos: descreva primeiro meio, composição, sujeito/mecanismo, tipografia e restrições; mantenha o prompt criativo enxuto e focado quando houver referências anexas.',
    '6. Sinergia arte e legenda: a arte vence a atenção e comunica o essencial em segundos; quando houver legenda separada, ela cumpre dois papéis sem repetir a manchete palavra por palavra — acrescenta contexto, critério prático ou detalhe concreto E assegura que o objetivo ou próximo passo declarado no briefing fique inequívoco.',
  ].join(' '),
  planner: [
    'Skill creative-core.v1:',
    'Cada uma das três propostas precisa de um mecanismo visual concreto e reconhecível (objeto, cena ou relação visual ligada ao objetivo), leitura imediata a 360 px (um foco dominante, alto contraste, respiro ao redor das letras, sem fontes condensadas comprimidas, sem microtexto ilegível dentro de objetos e sem colisão entre ornamentos e texto) e diversidade real de ângulo/hierarquia entre as posições 1, 2 e 3.',
    'Fatos confirmados são literais e obrigatórios; nunca invente rótulos comerciais, gratuidade, preço, data, local ou condição ausente.',
  ].join(' '),
});
