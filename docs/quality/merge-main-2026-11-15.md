# Integração da main — verificação local

Conforme o [ADR 0053](../adr/0053-integracao-da-main-e-decisoes-de-usabilidade.md), a integração combina `origin/main` em `828dc60` com os sete commits locais até `5ff7907`. Os conflitos de estúdio, CSS, navegação de testes e arquitetura foram resolvidos conforme as decisões explícitas da pessoa.

- 48 casos selecionados de domínio, catálogo, contexto por post e indisponibilidade de sinais aprovados.
- 25 cenários selecionados de navegador aprovados em rodadas: modais amplos com abas em desktop/celular, minimizar/reabrir conversa com rascunho preservado, nomes/criação confirmada/exclusão de posts, nomes de projetos, isolamento de conversas, retorno após reload, identidade e exportação integral. O caso da IA inicial foi adaptado para criar explicitamente um post antes de preparar um turno pendente; ele continua comprovando ausência de geração por abertura ou recarga e ausência de chave no navegador.
- O retorno às referências do post foi validado separadamente: arte, contexto e rascunho preservados; uma análise por seleção; reabrir o modal não repete a iniciativa.
- 57 testes do chat gerenciado de `packages/agents-api` aprovados.
- `quality:test`: 25 casos aprovados, incluindo as migrations 00029 e 00031 em PostgreSQL embarcado via PGlite. A prova de catálogo com rollback verifica propriedade/RLS, idempotência e recusa de ressurreição. A preparação do fixture foi corrigida para inserir o projeto com a identidade proprietária antes de trocar para o papel autenticado, que não possui INSERT da coluna id.
- Tipos estritos, ESLint e build Next de produção aprovados em cópia isolada. A revisão local permaneceu disponível.
- Inspeção visual em 1918 e 390 pixels: modais, referências, editor e conversa aberta/minimizada. Sem erros de página nas sessões isoladas. Cards mantêm borda e espaçamentos de 20px/14,4px para upload.

A numeração duplicada de ADR 0047 foi resolvida renumerando o documento de IA/jornada vindo da main para 0052, preservando sua origem e conteúdo histórico. O ADR 0050 permanece registrado como decisão posteriormente substituída.

Não houve geração paga, aplicação remota de migrations ou push. PGlite não substitui a validação de rollout no Supabase real. Esta evidência não declara execução de todos os gates, CI Linux, configuração Vercel ou publicação. Performance não foi reavaliada.
