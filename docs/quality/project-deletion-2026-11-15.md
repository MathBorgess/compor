# Exclusão de projetos — verificação local

Implementação na branch `feat/frontend-usability`, conforme [ADR 0047](../adr/0047-exclusao-logica-de-projetos.md). Exclusão lógica da lista web: arquivos e histórico permanecem preservados, e permissões históricas não são revogadas. Nenhum push ou aplicação remota de migration foi realizado.

- Contratos HTTP e adaptador: 8 testes aprovados, cobrindo origem, identidade, dados inválidos, token pessoal, filtro da lista, conflito, projeto alheio, resposta incerta e confirmação incompatível.
- Rota real do Next com autenticação/Supabase simulados: teste aprovado, incluindo DELETE e argumentos da RPC.
- Chromium real em viewport de celular: cancelamento sem requisição, falha sem remoção prematura, atualização manual, exclusão confirmada e persistência após reload aprovados. Nenhum erro de página; serviços simulados.
- ESLint e tipos estritos aprovados. Build de produção aprovado em cópia isolada; o último ajuste de rótulo acessível também foi compilado e exercitado no navegador.
- O servidor privado de revisão foi atualizado e reiniciado com os dados existentes preservados. Os testes de exclusão usam contexto isolado e APIs interceptadas; não excluíram projetos da pessoa.

A migration `20261115000030_project_deletion.sql` e o teste `supabase/tests/project_deletion_rollback.sql` estão preparados. O teste de banco não foi executado: o ambiente não dispõe de psql nem de Docker ativo. Não se declara validação de RLS em banco real, CI Linux, deploy ou Quality gate agregado. Performance adicional permanece fora desta rodada por orientação explícita da pessoa.
