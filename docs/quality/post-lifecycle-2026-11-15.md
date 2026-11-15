# Nome, confirmação e exclusão de posts — evidência local

Implementação descrita no [ADR 0051](../adr/0051-nome-confirmacao-e-exclusao-de-posts.md).

- 59 testes selecionados de domínio, workflow, contratos HTTP, catálogo e ferramentas aprovados. Cobrem preparação sem peça, nome obrigatório, cancelamento, persistência validada, exclusão com histórico intacto, pendências, origem, identidade, propriedade, respostas de outro projeto e ausência de repetição automática.
- Um teste integrado das rotas reais do Next com Supabase/identidade simulados aprovado: token pessoal, criação do nome, catálogo, exclusão, filtro de versões e recusa de projeto alheio.
- 21 cenários de navegador aprovados, sem skips: nome e confirmação em desktop/celular, nome separado do texto da arte, recarga antes de confirmar, formulário bloqueado durante envio, cancelamento sem criação, lixeira com confirmação, erro sem remoção visual, repetição com a mesma identidade, post legado salvo, exclusão observada em outro navegador, configurações, teclado, conversas isoladas e exportação integral.
- Oito casos adicionais de preparação/IndexedDB real aprovados, sem skips, cobrindo respostas retomadas, quota, CAS, isolamento local e arquivos legados preservados.
- ESLint, tipos estritos e build de produção aprovados. O Next local retornou `issues: []` no diagnóstico de compilação. A API local de posts respondeu 404 ao projeto fictício inexistente, sem criar dados.
- Inspeção visual em 1918 e 390 pixels: formulário com nome, lista nomeada, exclusão e card branco de Enviar imagens. O card tem borda e espaçamento de 20px no desktop e 14,4px no celular, consistente com as referências existentes. Nenhum erro de página nas sessões isoladas.

A migration `20261115000031_project_posts.sql` e a prova com rollback em `supabase/tests/post_catalog_rollback.sql` foram preparadas. Não houve execução SQL contra um banco real: `psql` e `pglast` não estão disponíveis neste ambiente. A prova de RLS/idempotência em PostgreSQL continua necessária antes de tratar a migration como validada. Os testes de adaptador/HTTP usam serviços simulados e não substituem essa prova.

O backend privado de revisão foi atualizado e reiniciado, preservando o arquivo de dados e uma cópia de segurança local. Não houve geração paga, aplicação remota de migration ou push. Não se declara aprovação do Quality gate completo, CI Linux, deploy ou isolamento entre contas reais. Performance não foi reavaliada.
