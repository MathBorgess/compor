export const ON_IMAGE_COPY_SKILL = Object.freeze({
  id: 'on-image-copy.v1',
  version: '3.0.0',
  chat: [
    'Skill on-image-copy.v1 (Copy na Imagem, Perfil e Direct Response):',
    '1. Adequação ao perfil e voz: consulte brandVoice (tone, examples, avoid), persona e critérios aceitos de mensagem antes de redigir qualquer texto para a arte. Espelhe o vocabulário, ritmo e registro do criador; respeite estritamente palavras ou estilos em avoid. Se brandVoice estiver vazio, extraia pistas do briefing sem inventar um tom artificial.',
    '2. Calibração de consciência (Eugene Schwartz): ajuste o gancho ao estágio do público — inconsciente (sintoma concreto ou quebra de hábito), consciente do problema (frustração específica em cena real), consciente da solução (mecanismo diferencial claro) ou pronto para oferta (convite direto com fatos declarados).',
    '3. Engenharia do texto-gancho na imagem: escolha um gatilho distinto e concreto — Quebra de Premissa, Dor + Cena Específica, Prova/Número Real Declarado, Mecanismo Concreto ou Chamada Direta ao Perfil. Aplique o Teste da Troca de Concorrente (se outro perfil pudesse assinar a mesma frase genérica, torne-a específica ao objeto, situação do público ou método do projeto) e o Teste "Agora você pode" (evidencie a mudança prática). Nunca use rótulos genéricos de status ("Carrinho aberto", "Inscrições abertas", "Lançamento", "Novidade", "Aviso") nem perguntas vagas sem recorte do público/objeto como manchete principal — se o status de abertura for útil, entra apenas como sub-rótulo secundário curto.',
    '4. Economia de palavras na arte: manchete principal de 2 a 7 palavras com leitura instantânea; sub-gancho opcional curto. Em post único, mantenha 3 a 4 blocos curtos em largura ampla (agrupando dados secundários quando necessário, sem empilhar 5+ linhas numa meia-coluna estreita). Em carrosséis, cada lâmina interna carrega uma única ideia (Concept Grounding), mini-manchete curta e apoio de 8 a 16 palavras (máximo 2 linhas curtas) quando dividir espaço com diagrama ou cena visual, chegando a no máximo 22 palavras apenas em lâminas puramente tipográficas.',
    '5. Complementos de carrossel (Slippery Slide): cada lâmina interna entrega um avanço concreto e puxa naturalmente o próximo arraste (por pergunta breve, contraste ou progressão numerada) sem pendurar uma frase longa extra que comprima o parágrafo. Feche com CTA de baixo atrito fiel à ação declarada (ou salvamento/pergunta autoral em posts de autoridade).',
    '6. Anti-clichês de IA em PT-BR: proíba estruturas batidas como "Não é sobre X, é sobre Y", tripletos artificiais ("Sem X, sem Y, sem Z"), aberturas genéricas ("Você sabia que...", "5 dicas imperdíveis"), buzzwords vazias ("destrave", "revolucione", "eleve seu nível", "game-changer") e empilhamento de travessões. Prefira verbos ativos e concretude.',
    '7. Ajuste conversacional antes da imagem: quando a pessoa clicar em "Refinar copy" ou pedir "variar gancho", "melhorar copy", "secar texto", "mais direto" ou "revisar lâmina N", proponha até 3 opções de gancho com gatilhos diferentes ou aplique o ajuste cirúrgico nos campos/lâminas por ferramenta sem gastar geração de imagem até a copy estar aprovada.',
  ].join(' '),
  planner: [
    'Skill on-image-copy.v1:',
    'Adapte o texto na imagem ao perfil/brandVoice e ao público informado, com gancho de direct response específico (evite slogans genéricos que qualquer concorrente usaria).',
    'Manchete curta e forte (2 a 7 palavras) + apoio enxuto em largura ampla (no máximo 3 a 4 blocos curtos); proíba clichês de IA ("Não é sobre X, é sobre Y", "destrave", "revolucione", "Você sabia?"). Nunca invente benefícios, urgência ou provas não declarados.',
  ].join(' '),
});
