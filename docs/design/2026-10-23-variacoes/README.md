# Compor — propostas de fluxo, wireframe e identidade

23/10/2026. Exploração solicitada por Matheus para comparar alternativas antes de prototipar. **Nenhuma direção foi aprovada e nenhum teste com pessoa real foi realizado nesta etapa.**

Abra [a galeria local](index.html) no navegador. A [versão visual no Google Docs](https://docs.google.com/document/d/1Qm1CWkFuU9WeRNR8iLD1Q8XxXB7UFcXRy7RGRocKvfw) reúne seis prévias e a síntese para leitura e comentários. Ela permite alternar fluxos, quadros e moodboards; os controles desenhados dentro das imagens são estáticos. O arquivo funciona sem servidor quando aberto diretamente. O [briefing de design e mercado](../../briefing-design-e-mercado-2026-10-23.md) e a [spec vigente](../../specs/compor-reestruturado-2026-10-23.md) continuam sendo as referências de produto.

## As alternativas

| Proposta | Centro da experiência | Potencial a testar | Principal risco | Arquivo editável |
|---|---|---|---|---|
| A — Estúdio direto | Uma peça, com edição e painéis contextuais | Controle imediato e menos transições | Sobrecarga para quem não sabe por onde começar | [A](excalidraw/a-estudio-direto.excalidraw) |
| B — Percurso guiado | Uma decisão por etapa | Orientação e próxima ação claras | Burocracia para quem já tem método | [B](excalidraw/b-percurso-guiado.excalidraw) |
| C — Bancada comparativa | Alternativas persistentes, com foco na escolhida | Comparar argumentos sem depender da memória | Indecisão e geração sem conclusão | [C](excalidraw/c-bancada-comparativa.excalidraw) |

A recomendação de teste é começar por A com quem chega com mensagem definida, comparar B quando houver desorientação e C quando existir dúvida explícita de abordagem. **É uma hipótese de enquadramento, não um ranking de preferência ou desempenho.** A pessoa satisfeita com seu processo pode legitimamente não mudar.

As três alternativas preservam: intenção explícita, uma composição para mensagem definida, duas rotas para explorar, edição direta, reescrita proposta antes de aplicar, correção preservada na recomposição, rejeição sem apagar o material, revisão de fatos, aprovação e saída separadas, recuperação e retomada. O macrofluxo se repete de propósito; a diferença está na organização da atividade.

## Como ler os desenhos

São 23 quadros em quatro arquivos Excalidraw: 15 telas principais, dois estados de proposta única, três diagramas de fluxo e três pranchas de estados compartilhados. Os PNGs têm 1600 × 1080, com notas fora da janela do aplicativo. Textos, formas e conexões permanecem elementos editáveis no Excalidraw.

- **Mensagem definida:** A1 → A2 → A4 → A5; B1 → B2-definida → B3 se houver ajuste → B4 → B5; C1 → C2-definida → C3 se houver ajuste → C4 → C5.
- **Exploração:** A1 → A3; B1 → B2; C1 → C2. Escolher uma rota permite ajustar ou seguir à revisão. As duas rotas são “tarefa repetida” e “exercício em ação”.
- Os exemplos dos painéis de edição e revisão usam o caminho da **mensagem definida**. Não representam uma troca automática do conteúdo da rota exploratória escolhida. No protótipo navegável, a revisão deverá carregar exatamente a rota selecionada.
- [Estados comuns](excalidraw/estados-comuns.excalidraw): geração, cancelamento, falha com acesso à peça anterior, reescrita com aplicar/manter, resultado atrasado, offline, antes/depois da composição, rejeição, aprovação e confirmação simulada de saída.

O exemplo é fictício: Marina divulga “Planilhas para a rotina”, cinco aulas gravadas com exercícios e inscrições abertas. “Acesso vitalício” é uma pendência deliberadamente introduzida para desenhar a revisão, não uma informação confirmada do curso. PNG + TXT não fornecem camadas editáveis para Canva. Geração, persistência, pagamentos e exportação real não foram implementados.

## Moodboards e objetos de logo

| Direção | Paleta de referência | Formas e objetos | Aplicação possível | Risco |
|---|---|---|---|---|
| [Oficina editorial](moodboards/01-oficina-editorial.png) | Marfim `#F5F1E8`, azul `#1C2841`, grafite `#2C2D2F`, terracota `#A94D36` | Folhas alinhadas, margens, cantos de enquadramento, encontro de vozes | Marca editorial; interface com sans legível e espaços claros | Parecer editor de documentos; balões sugerirem chat obrigatório |
| [Encaixe e composição](moodboards/02-encaixe-composicao.png) | Claro `#F4F0E5`, cobalto `#123EAB`, amarelo `#F6D550`, terracota `#C66342` | Módulos independentes, C em negativo, moldura articulada, quartos de círculo | Seleção e agrupamento claros; assinatura geométrica | Parecer construtor de templates ou deixar a marca do app dominar a campanha |
| [Caderno de autoria](moodboards/03-caderno-autoria.png) | Aveia `#F3EDE5`, ameixa `#382334`, lavanda `#C3ADC4`, argila `#B57B68` | Dobra de página, parênteses abertos, fita com abertura | Tons calmos e formas abertas; continuidade da escrita | Parecer bloco de notas; símbolo de fita perder leitura em tamanho pequeno |

Os códigos são propostas exatas para a próxima exploração, não amostras extraídas dos pixels. O contraste deve ser medido nos usos reais; a tabela não aprova combinações de texto/fundo. Os nove esboços de símbolo presentes nos moodboards são estudos visuais, sem pesquisa de marca, teste de reconhecimento ou promessa de exclusividade. Tipografias são direções de caráter, não fontes identificadas ou licenciadas pela imagem.

**Fluxo e identidade são decisões independentes:** qualquer um dos três moodboards pode acompanhar A, B ou C. Primeiro comparar os wireframes em preto e branco evita atribuir preferência de cor à organização do trabalho. A próxima aplicação visual deve manter a mesma peça do cliente ao variar somente a interface do Compor.

## O que os subagentes fizeram

[Critérios, inspeções e síntese](avaliacoes/04-sintese.md) preservam a voz das cinco categorias como **simulação apoiada no corpus**, incluindo satisfeitos e dores que o editor não resolve. UX/Product Design definiu os modelos antes dos desenhos e revisou os quadros corrigidos.

A crítica alterou os artefatos: entrada sem texto ganhou rascunho e fatos; o texto inicial permanece nas propostas anteriores à edição; Desfazer aparece na bancada; falha oferece acesso à peça anterior; a preservação do texto foi esclarecida; foram acrescentados antes/depois da recomposição, rejeição e confirmação de saída. Não foram calculadas taxas de sucesso, tempo economizado, satisfação ou receita a partir dos PNGs.

## Roteiro para validação humana

1. Pedir que a pessoa traga uma divulgação real e explique seu processo atual antes de mostrar o Compor.
2. Alternar a ordem de A, B e C entre participantes. Usar tarefas e materiais equivalentes; não sugerir uma vencedora.
3. Observar escolha de intenção, edição, recomposição, comparação, rejeição, confirmação de fato, aprovação e saída. Registrar ajuda, dúvidas, correções indesejadas e motivos para parar.
4. Separadamente, mostrar moodboards e perguntar o que cada um comunica, o que parece inadequado e se a marca do aplicativo compete com a marca da pessoa.
5. No protótipo funcional, comparar benefício e esforço total com o processo habitual. Observar uso externo, retorno em nova ocasião e disposição a pagar em etapas próprias.

Perguntas úteis: “Onde você começaria?”, “O que espera que este botão altere?”, “Qual trecho continua sendo seu?”, “Em qual momento você encerraria?”, “Seu processo atual resolveria melhor?”. Perguntar pelo episódio real, sem transformar concordância com o conceito em evidência de compra.

## Instalação, geração e reprodução

Foi instalado o [CLI oficial](https://github.com/excalidraw/cli), pacote `@excalidraw/cli@0.2.0`, com Node `v24.16.0`. Executável local: `/Users/matheusborges/.local/share/compor-design-tools/node_modules/.bin/excalidraw`. A renderização foi local, com Chrome já instalado, sem conta Excalidraw+.

O gerador cria cenas JSON nativas; o CLI valida e renderiza cada frame. Essa separação segue o pipeline documentado pelo projeto oficial. Para instalar em outro computador e reproduzir a partir da raiz deste repositório:

```sh
npm install -g @excalidraw/cli@0.2.0
node docs/design/2026-10-23-variacoes/scripts/gerar-wireframes.mjs
COMPOR_EXCALIDRAW_CLI=excalidraw node docs/design/2026-10-23-variacoes/scripts/renderizar.mjs
node docs/design/2026-10-23-variacoes/scripts/gerar-galeria.mjs
```

O comando de renderização sobrescreve somente os PNGs gerados nesta pasta. Não gera novamente os moodboards: eles foram produzidos com o **image_gen integrado**, uma chamada por direção, e copiados para o repositório. [Prompts completos](moodboards/prompts.json). Não são referências coletadas de marcas externas.

[Manifesto de quadros](quadros.json) · [resultado do CLI](renderizacao.json) · [auditoria da entrega](verificacao.json). A auditoria verifica os desenhos e a navegação da galeria; não testa uma implementação do Compor.
