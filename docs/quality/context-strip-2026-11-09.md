# Faixa de contexto e público único — 09/11/2026

Implementação da issue #25 sobre a base `93dc7d3`, em Linux, Node 24.19.0 e Chromium 151.0.7922.173. Serviços externos foram simulados; não houve chamada paga nem teste com público real.

## Comportamento verificado

- A leitura de estados antigos aplica as três regras: vazio cede, iguais se fundem e diferentes conservam ambas as descrições até a escolha explícita. A edição por briefing ou persona mantém um público único; o planejador recebe uma única propriedade `publico`.
- A exploração não inicia uma imagem enquanto houver conflito de público. O teste de navegador confirma ausência de POST nesse estado, escolhe uma descrição e confere o contexto da proposta seguinte.
- A faixa permanece disponível ao alternar entre referências e post. A edição por teclado, a escolha do público, os fatos confirmados/pendentes/omitidos, o texto preservado e os alvos de pelo menos 44 px foram exercitados no navegador. Em 390 px não houve transbordamento horizontal.
- `offerFacts` conserva a origem do registro de entrevista: informado, sugerido e pulado viram, respectivamente, confirmado, pendente e omitido. O registro original permanece na chave de sessão da própria conta/projeto. Público não é classificado como fato pelo conteúdo do texto.
- O servidor valida os novos campos do contexto antes de reservar a tentativa ou chamar o fornecedor. Tipos e testes acompanham a implementação; um status inventado, uma resolução contraditória, ID duplicado ou credencial não chegam ao provedor.

Resultados locais dos checks focados:

| Verificação | Resultado |
| --- | --- |
| `quality:lint` e `quality:typecheck` | Aprovados |
| Estado, migração de contexto e entrevista | 33/33 |
| Pacote Agile Deliberation | 27/27 |
| Contrato do chat com fornecedor simulado | 40/40 |
| `context-strip-browser.test.mjs` | 1/1 |
| `exploration-audience-browser.test.mjs` | 1/1 |

As capturas das duas alternativas de layout e a decisão delegada estão no [ADR 0031](../adr/0031-faixa-de-contexto-publico-unico-e-revisao.md). O protótipo HTML não integra o aplicativo. Os screenshots do teste focado ficam fora do Git, em `/workspace/scratch/context-strip`.

## Bundle e limites

Não foi acrescentada dependência. A análise anterior fornecida pelo fluxo principal é `codex-legacy-before-93dc7d3`, exportada em `/workspace/scratch/compor-legacy-before.jsonl.gz`, para todas as rotas e saídas de cliente. A faixa é importada por `studio-app.tsx`, depois da sessão, e substitui o resumo anterior no canvas. Os módulos de estado e migração são públicos e locais ao navegador.

O tipo `StudioContext` vem de um `import type` do contrato do servidor; a implementação não é uma importação de runtime. A conferência do grafo emitido, o snapshot posterior e a medição gzip por arquivo serão executados no fluxo de integração cumulativa, após a remoção autorizada do legado. Esta evidência focada não declara aprovado o orçamento final nem o CI. Nenhum orçamento foi alterado.

Estados novos incluem um campo local opcional e sincronizam as representações antigas do público. Clientes antigos com schema estrito não ganham suporte automático ao novo campo. Não houve migration de Supabase nem envio do briefing ou da persona ao banco.
