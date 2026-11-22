export const CREATIVE_CORE_SKILL = Object.freeze({
  id: 'creative-core.v1',
  version: '4.0.0',
  chat: [
    'Skill creative-core.v1 (Direção Criativa Compor):',
    '1. Mecanismo visual antes do prompt: defina em uma frase qual objeto, cena ou relação visual concretiza a ideia do post. Adjetivos de estilo sozinhos não substituem um mecanismo visual reconhecível.',
    '2. Teste dos 360 px (Squint Test): garanta um foco visual dominante, contraste alto entre texto e fundo, no máximo dois pesos tipográficos (peso forte/bold apenas na manchete e destaques; peso regular ou médio, em corpo menor e com entrelinha arejada, no texto de apoio — nunca parágrafos corridos em bold pesado colado) e respiro generoso. Evite fontes condensadas em corpo de texto, meias-colunas estreitas comprimindo linhas longas ao lado de objetos grandes e microtexto diegético improvisado dentro de embalagens, telas ou papéis (qualquer texto dentro de um objeto precisa ser curto, literal e legível a 360 px; caso contrário, use formas ou ícones sem letras).',
    '3. Diversidade conceitual real (Andromeda): ao propor alternativas ou variantes, varie o ângulo (dor, mecanismo, cena de uso, prova ou recorte) e a hierarquia — nunca repita o mesmo layout apenas trocando palavras ou fundo.',
    '4. Rigor factual absoluto: fatos em offerFacts com status confirmed são obrigatórios e literais. Nunca invente preço, gratuidade, prazo, data, local, benefício, estatística ou depoimento. Fatos pending ou omitted nunca entram como promessa na arte. Quando a peça incluir cálculos ou comparações numéricas, escreva cada operação literalmente e confira que ambos os lados de qualquer igualdade sejam matematicamente exatos, sem deixar o gerador inferir sinais.',
    '5. Prompts positivos e concisos: descreva primeiro meio, composição, sujeito/mecanismo, tipografia e restrições; mantenha o prompt criativo enxuto e focado quando houver referências anexas.',
    '6. Sinergia arte e legenda: a arte vence a atenção e comunica o essencial em segundos; quando houver legenda separada, ela deve abrir com valor inédito ancorado no briefing (um critério prático de decisão, uma situação ou pergunta concreta da rotina do público, um exemplo observável de uso ou o bastidor do método — sem inventar fatos da oferta). Quando a arte já apresenta a oferta completa e a chamada, NÃO recapitule os mesmos dados em resumo-espelho (feche o próximo passo em no máximo 1 frase curta); quando a arte for minimalista, assegure que o objetivo e o canal do próximo passo fiquem explícitos na legenda.',
  ].join(' '),
  planner: [
    'Skill creative-core.v1:',
    'Cada uma das três propostas precisa de um mecanismo visual concreto e reconhecível (objeto, cena ou relação visual ligada ao objetivo), leitura imediata a 360 px (um foco dominante, alto contraste, respiro ao redor das letras, sem fontes condensadas comprimidas, sem microtexto ilegível dentro de objetos e sem colisão entre ornamentos e texto) e diversidade real de ângulo/hierarquia entre as posições 1, 2 e 3.',
    'Fatos confirmados são literais e obrigatórios; nunca invente rótulos comerciais, gratuidade, preço, data, local ou condição ausente.',
  ].join(' '),
});
