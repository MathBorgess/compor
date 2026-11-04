# Supabase isolado — inventário e plano de validação

Em 04/11/2026, esta é uma preparação local. Nenhuma conexão, migração, escrita ou teste novo foi feito no Supabase por este recorte. O [relato anterior de ROLLBACK](2026-11-03-supabase-rls-validacao.md) aplica-se somente aos snapshots ali identificados; não prova as migrações posteriores ou serviços gerenciados.

`supabase/tests/preflight_readonly.sql` consulta apenas catálogos e information_schema numa transação `READ ONLY`, com `search_path` limitado a `pg_catalog`, `statement_timeout` e `ROLLBACK`. Lista o contexto do papel, RLS, políticas, grants, nomes e metadados de funções, triggers, regras, event triggers e extensões. Inclui, se já existirem, `usage_measurements` e as RPCs de `00008` a `00010`; não aplica nem valida a presença delas. O campo `sets_search_path` apenas informa que há configuração, não se ela é segura. Não retorna corpos de funções, valores de configuração ou registros de usuários, projetos, buckets ou arquivos. Sua sintaxe foi exercitada em PGlite local, não no Supabase; privilégios insuficientes ou diferenças de plataforma podem impedir o inventário. Saída contém metadados internos e deve permanecer privada. Inventário não prova que o banco está vazio, que toda regra é segura, que RLS funciona, ou que funções, extensões e triggers não tenham efeitos externos. A visibilidade de privilégios pelo information_schema também depende do papel usado.

A captura também informa para `storage.objects` e `storage.buckets` se o papel atual é membro do proprietário, se herda seus privilégios, e seus privilégios de schema e INSERT. São indicadores de catálogo, não uma prova de que DDL será autorizado pelo serviço gerenciado: membership, `BYPASSRLS`, INSERT e CREATE no schema não equivalem isoladamente ao direito de criar política. Não muda de papel nem executa DDL. Para o histórico, indica se a relação `supabase_migrations.schema_migrations` existe e verifica suas características antes de consultar apenas versões numéricas de 14 dígitos; valores fora desse formato são omitidos. Se a tabela estiver ausente ou não atender às verificações de estrutura, RLS, regras e privilégios, registra `absent_or_unverified` sem lê-la. Mesmo `available` com lista vazia não exclui versões omitidas, mudanças manuais, drift ou execução não registrada; verifique também o estado efetivo. A captura anterior não contém estes campos e uma nova execução é necessária. A checagem de fluxo `psql` foi exercitada em PGlite local via socket Unix, e não comprova comportamento no serviço gerenciado. Fontes: [histórico de migrações Supabase](https://supabase.com/docs/guides/deployment/database-migrations), [funções de privilégios PostgreSQL](https://www.postgresql.org/docs/current/functions-info.html).

Antes de qualquer conexão, confirmar no painel a organização, o projeto **isolado e descartável**, o host exato e o certificado CA oficial aplicável; nunca usar banco compartilhado ou de produção. O próprio operador pode fornecer host DNS, porta, banco e usuário sem colocar senha na linha de comando. O invólucro abaixo força `PGSSLMODE=verify-full`, usa `PGSSLROOTCERT` para uma CA confiável e solicita a senha via `psql -W`. Também define `PGGSSENCMODE=disable`: quando GSS está disponível, o libpq pode priorizá-lo sobre SSL mesmo com `sslmode` configurado; desativá-lo garante que a conexão use a verificação TLS pretendida. `verify-full` deve verificar nome do host e cadeia; não usar IP alternativo ou desabilitar TLS para contornar erro. Confirmar a identidade do destino antes de executar e não registrar credenciais ou o resultado em repositório. A saída é uma entrada para revisão, não autorização para aplicar SQL. Fonte: [PostgreSQL, parâmetros de conexão](https://www.postgresql.org/docs/current/libpq-connect.html).

Para captura privada pelo operador, a partir da raiz do repositório, preencha somente os cinco valores **não secretos** abaixo no terminal. A senha é solicitada interativamente por `psql -W`; nunca a inclua em variável, URL, arquivo ou comando. O invólucro valida banco como identificador simples e recusa URI ou conninfo; valida host DNS, porta e usuário antes de iniciar `psql`, e `env -i` evita opções e credenciais PostgreSQL herdadas. A validação sintática não comprova que host ou certificado pertencem ao projeto correto: o operador deve verificá-los no painel. A pasta temporária criada pertence ao usuário e o arquivo fica restrito por `umask`; mensagens de erro ficam no terminal.

```sh
COMPOR_DB_HOST='host.do.projeto.isolado' \
COMPOR_DB_PORT='5432' \
COMPOR_DB_USER='usuario_do_banco' \
COMPOR_DB_NAME='nome_do_banco' \
COMPOR_CA_CERT='/caminho/absoluto/ca-oficial.pem' \
  sh supabase/tests/preflight_capture.sh
```

Revise a captura localmente antes de compartilhá-la: ela contém nomes internos e privilégios. O comando não coleta senha intencionalmente, porém não é uma garantia sobre dados inseridos fora dele, autenticação do sistema ou mensagens do ambiente. Não execute o preflight caso o destino ou o certificado não estejam confirmados.

## Escopo das migrações propostas

| Migração | Objeto e controle a verificar | Limite ou teste negativo necessário |
| --- | --- | --- |
| 00000 | Projetos por identidade, SELECT/INSERT e RLS | Outra conta, papel anônimo, grants herdados e bypass de RLS. |
| 00001 | Versões e `save_piece_version`, trava e versão esperada | Acesso cruzado, escrita direta, conflito e duas conexões PostgreSQL independentes. |
| 00002 | Tentativas e reserva idempotente | A versão histórica concede UPDATE direto ao titular: estado não é imutável. Não usar sem correção revisada. |
| 00003 | Bucket privado, caminho canônico e políticas restritivas | Políticas preexistentes permissivas, todos os verbos, outro bucket, papéis com bypass e Storage API real. |
| 00004 | Reserva por chamada e projeto, chave única, estado incerto | Duas contas, parâmetros trocados, chamadas repetidas e concorrência real. |
| 00005 | Declaração explícita por reserva | Sem confirmação, outra conta, tentativa encerrada; declaração não prova clique humano. |
| 00006 | Claim e associação do asset | Sem consentimento, outra conta, repetição, estado incerto e objeto ausente; associação não prova origem dos bytes. |
| 00007 | Claim do envio do resultado | Troca de contexto, duplicação e transição desconhecida; aceitação não prova conclusão do turno. |
| 00008 | Revogação de UPDATE direto e transição terminal por RPC autenticada | Revisar a migração aditiva e isolamento; o titular ainda pode chamar a RPC para sua própria tentativa. |
| 00009 | Medição sanitizada por tentativa e etapa, estimativa com dados suficientes | Conferir RLS/RPCs, isolamento, deduplicação e estados; transações concorrentes e intervalo entre commit e chamada continuam sem prova. O titular pode forjar seus próprios registros. |
| 00010 | Listagem paginada de IDs de assets por projeto, peça e versão | Verificar propriedade e RLS com duas contas, cursor, caminhos canônicos e Storage real; o inventário não lê nem valida objetos. |

Calcular `shasum -a 256 supabase/migrations/*.sql` e comparar os arquivos efetivamente revisados imediatamente antes de qualquer ensaio. Não editar migrações históricas já registradas; conferir estado e histórico do projeto para determinar o procedimento correto, sem reaplicar cegamente ou pressupor que a lista é inédita.

## Sequência pendente

1. Revisar os catálogos, inclusive funções de triggers e de regras de reescrita, event triggers, extensões, grants herdados, ownership, RLS e políticas anteriores. Uma regra em uma tabela pode alcançar outra e seus efeitos. Inventário vazio ou ROLLBACK não provam ausência de efeitos fora da transação. O script histórico de teste com escrita em `auth.users` e qualquer teste que altere `storage.objects` **não devem ser executados** somente com base neste preflight.
2. Preparar e revisar um método de ensaio específico para o projeto e sua versão gerenciada, com plano de recuperação e verificação independente de que não há efeitos indiretos não transacionais. Exercitar SQL com dados sintéticos e dois papéis/identidades somente quando o método estiver demonstrado seguro. Dois clientes/conexões independentes devem testar simultaneamente reserva e transições; PGlite de uma conexão não satisfaz esse requisito.
3. Testar arquivos **pela API de Storage**, com duas contas de teste autenticadas: leitura e inserção próprias, tentativa de acesso cruzado, nomes fora do padrão, colisão, atualização/exclusão, outros buckets, MIME e limites. Não manipular diretamente `storage.objects` como mecanismo de upload/limpeza. Verificar comportamento com políticas adversárias e regras preexistentes sob um método isolado revisado.
4. Configurar e testar Google Auth, URLs fixas e callback, origem/CSRF, logout e revogação; a chave Supabase no app deve ser publicável, e a identidade deve ser o token verificado da pessoa, nunca service role. Validar MCP/Codex e fluxo do app separadamente com credenciais reais somente no escopo autorizado.
5. Habilitar a rota de imagem somente após revisão dos resultados, relação durável do asset à versão, tratamento de interrupção e reconciliação sem retry cego. Documentar evidências, limitações e custos sem expor tokens ou conteúdo criativo. Testes simulados não demonstram jornada E2E nem justificam status de produção.
