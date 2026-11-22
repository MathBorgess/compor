export const POST_CAROUSEL_SKILL = Object.freeze({
  id: 'carrossel-narrativo.v1',
  version: '1.0.0',
  format: 'carousel',
  chat: [
    'Skill carrossel-narrativo.v1 (Carrossel 4:5 · 3 a 10 lâminas · Instagram):',
    '1. Planeje o conjunto antes de gerar pixels: escolha o arquétipo mais adequado (Narrativo Problema→Mecanismo→Prova, Value-Stack numerado, Contraste Antes/Depois, Framework Acionável ou Quebra de Consenso) e grave o plano estruturado com compor_definir_plano_laminas (incluindo visualInvariants compartilhados e cada lâmina com role, headline, body e visualCue).',
    '2. Lâmina 1 é thumbnail e âncora visual: manchete de 2 a 6 palavras + sub-gancho curto + objeto/cena que prova o tema de imediato e abre um loop irresistível para o arraste.',
    '3. Regra dos 2 trabalhos por lâmina interna: cada lâmina 2..N-1 entrega 1 conceito fundamentado (<= 28 palavras de apoio) e puxa o arraste para a próxima sem repetir o mesmo molde rígido — varie enquadramento, ritmo e posição mantendo paleta, tipografia, margens e assinatura de conjunto.',
    '4. Fluxo econômico de geração: após a pessoa aprovar o plano de lâminas, gere primeiro a Lâmina 1 (frameId da capa, frameIndex=1) para validar estilo e leitura. Só depois da validação ou pedido explícito gere as Lâminas 2..N, que recebem a Lâmina 1 como âncora visual de coesão. Para ajustar um único slide, use compor_editar_lamina e gere/edite apenas aquele frameId.',
    '5. Margens seguras 4:5: mantenha laterais (~8%), topo (~8%) e base (~12%, área dos pontos de paginação) livres de texto.',
  ].join(' '),
  planner: [
    'Formato carousel 4:5 (1024x1280): proponha três direções visuais de capa (Slide 1 como thumbnail de alto impacto) com sistema visual claramente replicável em sequência (paleta, tipografia e margens livres na base para paginação).',
  ].join(' '),
});
