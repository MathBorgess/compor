# Bancada de referências e integração do PR 52 — 15/11/2026

Base: `origin/main` em `828dc60`. Integração preserva o histórico de `feat/frontend-usability` em `4714d09`, junto à bancada do exemplo 3 e à passagem da última exploração concluída para a v0.

## Comportamento verificado

- Pinterest, envio e propostas usam a região superior, com seleção compacta e conversa no mesmo viewport. Consultar propostas não gera imagens; pedidos de três propostas são explícitos e preservam pausas e recuperação.
- A preparação inicial termina na lista de posts vazia. Nome e recibo humano confirmado precedem a criação do post real e a cópia da v0. A identidade interna de referências fica sem bytes e fora do catálogo. Novos posts por chat seguem a mesma confirmação.
- A v0 mantém os bytes da última conclusão confirmada da conversa, sem aprovação automática. Seleções posteriores de Pinterest ou upload não substituem a candidata nem recebem atribuição retroativa. A inserção IndexedDB verifica revisão e ausência de outra imagem-base.
- O mesmo controlador do chat entrega recibos e preserva compositor/turno no portal. A trava de criação impede mudar a preparação durante a confirmação; o guard de recibo também rejeita contexto divergente. O post seguinte não herda o encaminhamento consumido.
- Nome explícito de projeto/post, menu lateral, modais e exclusões lógicas do PR 52 permanecem integrados. As migrations 00030/00031 são pré-requisitos do uso desses contratos no ambiente real.

## Evidências locais

Ambiente: Codex desktop, Darwin 27.2.0, Node 24.16.0, Next 16.4.4, Chrome 157.0.8103.51. Modelo não informado pelo runtime. Política fornecida mathai-agent-config revisão `3b095b1e008e6bfd6af49351b12af544c3c295cc`; AGENTS.md local SHA256 `8c3b24688e08cb2478d35a12e914b29c51cc8c1fa4321be78f57e57e2e5c95e5`.

| Verificação | Evidência |
| --- | --- |
| Lint e TypeScript estrito | Aprovados |
| Contratos de pacotes e migrações | 473 testes JavaScript + 22 Python aprovados, sem pulos |
| Avaliadores de qualidade | 25 aprovados, sem pulos |
| Percurso real Next, entrada por botão e chat | 3 variantes aprovadas; bytes v0, catálogo, nome normalizado, recarga, portal e post seguinte |
| Domínio, IndexedDB e workflow de v0 | 20 aprovados, sem pulos |
| Build de produção | Aprovado |
| Suíte web completa da combinação | 466/466 aprovados; zero falhas e zero pulos (475,5 s) |
| Performance da combinação final | Aprovada: JS 297.914/300.000 bytes; LCP mediano 627 ms, TBT 0 ms e CLS 0,008 em cinco execuções |
| Inspeção visual e acessibilidade | [Relatório e comparação](../../design-qa.md) |

A primeira execução web revelou fixtures que pressupunham confirmação síncrona de `/api/posts`, além de um simulado que encadeava edição após `declined`. A correção espera o formulário desaparecer após o recibo e exige nome/confirmar antes de um novo turno. Preserva as verificações de versões, bytes, conflitos e isolamento de conversa; não relaxa gates.

A revisão independente encontrou dois P2 de integração, corrigidos antes da validação final: análise poderia começar depois de ocultar as referências; e um novo post pedido pelo chat das referências de um projeto já pronto perdia a candidata à v0. A leitura agora revalida disponibilidade após cada preparação assíncrona, com uma época própria de visibilidade; busy/pending da própria operação não a cancelam. A saída pelo agente captura o encaminhamento da conversa ativa. As regressões de fechar/reabrir e o percurso de projeto pronto passaram. Não houve outro P0/P1/P2 comprovado nos recibos, catálogo/RLS ou exclusões lógicas. Revisão estática não substitui execução.

## Bundle

Os snapshots completos `references-combined-before-01a1e14c-01` e `references-combined-mini-final-01a1e14c-01` mantêm o mesmo escopo de 36 rotas. JavaScript gzip real de todos os chunks: 306.853 → 297.755 bytes (−9.098; −2,96%). Atribuição de cliente do analisador: 384.410 → 373.679 bytes; Zod: 35.299 → 24.216. Métricas atribuídas não equivalem à transferência ou ao gzip dos arquivos. Nenhum limite foi elevado.

A entrada Mini da versão instalada preserva validação, refinamentos, defaults, limites e locale inglês. O nome interno do erro muda para `$ZodError`; não há consumidor de classe/nome no código examinado. Schemas de ferramentas WebMCP foram mantidos. Manifests, versões e locks não mudaram. Há seis fontes compostas sem identidade emitida individual e seis saídas que não são chunks; o mapa completo mantém essas lacunas explícitas, sem inferir ausência de código.

## Limites e publicação

Serviços simulados não comprovam geração/cobrança real, login real, isolamento entre contas reais ou qualidade criativa. Lighthouse mede a entrada sem sessão. Validação local não comprova CI Linux ou deploy. As evidências remotas serão registradas separadamente. Nenhuma migration remota ou promoção de produção foi executada nesta validação local.

## Preview remoto

O push da branch `codex/references-workbench-v0` gerou o [preview 25136e8](https://compor-marco0-1h4fiuxbx-math-ai2.vercel.app/), estado READY confirmado na Vercel; a entrada respondeu 200 pelo conector autenticado. Isso não comprova login, migrations ou geração reais. A criação do PR pelo conector abriu formulário pendente de envio humano; nenhum PR de código havia sido criado na consulta pelo head. Não houve merge na main.
