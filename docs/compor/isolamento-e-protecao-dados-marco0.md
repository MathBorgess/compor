# Isolamento e proteção de dados — marco 0

Registro do estado e das evidências observadas em 4 de novembro de 2026 no projeto Supabase de teste do Compor e no deployment Vercel. O objetivo é permitir revisar onde a identidade é verificada, como uma operação é vinculada à conta e quais garantias ainda dependem de prova. O código e a configuração podem mudar; este registro não substitui a verificação do ambiente ativo.

## Identidade e escopo

O isolamento do marco 0 é por **conta**, não por organização ou equipe compartilhada: um projeto pertence a um único `owner_id`, associado à identidade do Supabase. O Google é o provedor de login do aplicativo; o Supabase Auth mantém a sessão e entrega a identidade usada pelo backend e pelo Postgres. A chave OpenAI fornecida no app serve para a sessão de geração, não identifica a conta Compor e não é exigida pelo Codex.

No servidor, a sessão obtida dos cookies não é aceita como prova apenas pela leitura do JWT: o backend consulta `auth.getUser` e verifica o mesmo token no Supabase. As chamadas ao PostgREST e ao Storage usam a **chave publicável do projeto e o token da pessoa**, não uma chave administrativa/service role. O servidor verifica novamente, por operação, que projeto e, quando aplicável, peça e versão pertencem à conta. Nas operações de escrita da web, a origem fixa do aplicativo é conferida; respostas sensíveis usam `no-store`. A RLS é a barreira de dados no banco, complementada pelas verificações de entrada e de propriedade no backend; nenhuma delas deve ser tratada como substituta da outra.

Os dados de projetos, peças, tentativas e imagens que a pessoa salvar atravessam o backend na Vercel e são persistidos no Supabase. Quando a geração for solicitada, os dados necessários ao pedido e a chave de sessão são enviados à OpenAI para processar a chamada; a política de retenção do provedor é separada da persistência do Compor. A pessoa já aceitou retenção na OpenAI e armazenamento nos EUA ou na UE para o marco discutido. Este desenho não comprova criptografia em repouso, apagamento em backups ou residência regional de cada serviço.

O projeto Google estava em modo de teste com uma conta de teste na data do registro. Isso não comprova quais outros provedores ou meios de cadastro estão habilitados no Supabase, nem constitui controle geral de acesso para uma implantação pública. A configuração precisa ser revista antes de ampliar o acesso.

Fontes de implementação: [`apps/web/lib/supabase.js`](../../apps/web/lib/supabase.js), [`apps/web/lib/agent-auth.mjs`](../../apps/web/lib/agent-auth.mjs), [`apps/web/lib/project-route.mjs`](../../apps/web/lib/project-route.mjs) e [`apps/web/lib/piece-route.mjs`](../../apps/web/lib/piece-route.mjs).

## Como a configuração foi feita no teste

1. Foi usado um projeto Supabase dedicado. Google foi configurado como provedor de login; o cliente Google retorna para o callback do Supabase e a URL autorizada de retorno do Supabase aponta para `/auth/callback` na origem do Compor. A chave Google permanece no gerenciador do provedor, não no repositório.
2. Na Vercel foram configurados `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_ORIGIN`, além dos segredos independentes do backend. A chave Supabase utilizada pelas rotas é publicável. O login Google do app foi testado com a conta de teste.
3. As migrações versionadas `20261103000000` a `20261103000010` constituem a configuração SQL das tabelas, grants, RLS, RPCs e do bucket. O procedimento preparado para o ambiente dedicado agrupa os arquivos em uma transação e registra seus hashes em auditoria própria. O inventário posterior encontrou as 11 entradas e os objetos consultados. O guard de uma tentativa subsequente encontrou a auditoria existente e impediu reaplicação; não há evidência de um segundo conjunto de alterações.
4. No Supabase OAuth Server, a origem do site foi definida como a origem do app, o caminho de autorização como `/oauth/consent` e o registro dinâmico foi habilitado para o teste. No deployment, `MCP_OAUTH_ENABLED=true` disponibilizou a descoberta e o consentimento. A conexão local foi registrada como `compor-remote`, sem substituir o MCP local anterior. A aprovação usa os escopos `openid`, `profile`, `email` e `offline_access`; os poderes de operação decorrem da conta e dos contratos do MCP.
5. Após a aplicação, foi executado no Postgres do projeto de teste o ensaio revisado de duas claims sintéticas sob o papel `authenticated`. O teste terminou em rollback e verificou a remoção das fixtures. Ele não equivale à prova de duas contas autenticadas no provedor.

Esses passos descrevem o ambiente de teste, não instruem a repetir migrações num banco existente. Antes de qualquer mudança no ambiente, inventariar histórico, políticas, grants e objetos, validar o alvo e planejar recuperação. Nunca substituir falha de RLS ou de verificação TLS por acesso privilegiado.

## Banco: RLS, privilégios e RPCs

| Recurso | Política e limite do papel autenticado |
| --- | --- |
| `projects` | RLS para selecionar e criar somente quando `owner_id = auth.uid()`. `owner_id` é preenchido no banco; o grant de inserção permite fornecer somente o título. |
| `piece_versions` | A leitura exige que o projeto associado pertença a `auth.uid()`. Não há grant de escrita direta para a pessoa autenticada. `save_piece_version` valida conteúdo, confere a propriedade, bloqueia o projeto e compara a versão esperada antes de inserir; conflito não sobrescreve a versão anterior. |
| `agent_attempts` | Seleção e inserção exigem conta e projeto próprios. A reserva usa chave de idempotência por conta. A migração `00008` revoga o `UPDATE` direto antes concedido e restringe o encerramento à RPC `finish_agent_attempt`, que confere titular, projeto e transição de `started` para estado terminal. |
| Reservas, declarações e execuções de imagem | As tabelas têm RLS e grants restritos; as RPCs conferem o contexto e titular antes das transições. Claims e estados desconhecidos reduzem repetição automática, mas não tornam atômica a chamada HTTP paga posterior. |
| `usage_measurements` | RLS limita leitura à conta e ao projeto próprios; as RPCs registram estados e metadados de consumo delimitados. O próprio titular pode chamar as RPCs referentes aos seus registros: esses dados não são uma auditoria inviolável nem uma fatura. |

As RPCs de escrita que usam `SECURITY DEFINER` não devem confiar em um `project_id` fornecido pelo cliente: elas verificam `auth.uid()` e propriedade explicitamente e fixam `search_path` vazio. A RPC de listagem de imagens é `SECURITY INVOKER` e consulta com os privilégios e políticas do chamador. Os grants de execução são revogados de papéis não previstos e concedidos conforme a operação. A função auxiliar de verificação do caminho do Storage possui execução concedida a `PUBLIC` por necessidade de avaliação das políticas; ela continua como invoker e depende dos privilégios e da RLS subjacentes.

O papel administrativo do banco observado no ambiente de teste possui `BYPASSRLS`; proprietários de tabelas e outros papéis privilegiados também podem ter privilégios que contornam a RLS. Por isso, um teste feito como administrador sem mudar para o papel e as claims da pessoa não prova isolamento. Uma chave service role no backend também contornaria esse desenho.

Fontes: [migração de projetos](../../supabase/migrations/20261103000000_projects.sql), [versões](../../supabase/migrations/20261103000001_piece_versions.sql), [tentativas](../../supabase/migrations/20261103000002_agent_attempts.sql), [transições terminais](../../supabase/migrations/20261103000008_agent_attempt_state.sql), [uso](../../supabase/migrations/20261103000009_usage_measurements.sql) e [listagem de imagens](../../supabase/migrations/20261103000010_list_piece_image_assets.sql).

## Storage privado

O bucket `compor-project-images` foi configurado como privado, com `image/png` e limite de 8 MiB. O caminho canônico é `conta/projeto/peça/versão/asset.png`, em que os identificadores são UUIDs e a versão é um inteiro positivo. O nome do objeto não é autorização: a função `compor_private_image_path_authorized` confere o formato, compara a conta com `auth.uid()` e exige uma versão existente no projeto pertencente a essa conta.

As políticas permitem `SELECT` e `INSERT` ao papel autenticado quando a verificação do caminho passa. Políticas **restritivas** adicionais intersectam quaisquer políticas permissivas aplicáveis: para este bucket recusam acesso de papéis diferentes de `authenticated` e impedem `UPDATE` e `DELETE` sob RLS. Elas não restringem outros buckets, nem papéis que ignoram RLS. A listagem por versão verifica a propriedade mesmo quando não há objetos; referências retornadas têm origem desconhecida e não provam geração ou aprovação.

O endpoint privado de imagens também valida sessão, origem no upload, versão, formato e tamanho. Uma imagem maior que 4 MiB e de até 8 MiB pode ser lida em partes de 2 MiB, com reautorização por parte e conferência de tamanho e SHA-256 ao remontar. Essa conferência detecta divergências entre partes; não autentica a origem da imagem. O upload manual da interface aceita até 4 MiB. Uma imagem maior que 8 MiB permanece fora do limite suportado. Uso de objetos via API de Storage não foi comprovado no projeto real na data deste registro.

Fontes: [políticas do bucket](../../supabase/migrations/20261103000003_private_project_images.sql), [listagem](../../supabase/migrations/20261103000010_list_piece_image_assets.sql), [handler de imagem](../../packages/private-images/src/index.mjs) e [reconstrução no navegador](../../apps/web/lib/private-image-fetch.mjs).

## Codex e MCP delegado à Agents API

O Codex Desktop conecta-se a `/api/mcp` por OAuth, com consentimento explícito e PKCE, associado à conta Compor. Em cada requisição MCP, o token é verificado no Supabase; as consultas e gravações usam o mesmo token e validam o proprietário. As tools expostas permitem, entre outras operações, listar projetos, descobrir peças e ler/salvar versões. O Codex usa sua própria capacidade de modelo e **não depende da chave OpenAI inserida no app**. A tela informa que o cliente autorizado poderá ler e criar projetos e peças da conta; a interface de revogação ainda não foi implementada.

Para a Agents API existe um endpoint separado, `/api/agent-mcp`, controlado por flag. O backend emite um envelope opaco autenticado e cifrado com chave exclusiva, contendo token de usuário, identidade, projeto e expiração de cinco minutos. Ele valida a identidade e propriedade antes de emitir e novamente ao atender operações; somente o subconjunto permitido de tools é exposto ao agente. A rotação da chave invalida envelopes ativos. Turnos que ultrapassem o prazo, renovação e reconciliação ainda não estão comprovados. O envelope não é a chave OpenAI do usuário, e sua posse temporária ainda concede a capacidade delegada dentro do escopo e prazo definidos.

A chave OpenAI da web permanece em memória da aba durante a sessão e é enviada temporariamente ao backend para a chamada solicitada, quando o fluxo estiver habilitado. Ela não é persistida em banco, cookies, `localStorage` ou `sessionStorage` pelo fluxo implementado; não deve aparecer em logs, URLs, resultados de tools ou documentos. A memória e o campo podem ser acessíveis a código ou extensões com acesso à página, e não há garantia de apagamento físico imediato. Os rascunhos e marcadores de tentativa podem usar `sessionStorage` por conta, projeto, peça e versão, sem armazenar a chave; seu conteúdo pode se perder ao encerrar a aba.

Fontes: [rota MCP](../../apps/web/app/api/mcp/route.js), [verificação do token e stores](../../packages/remote-mcp/src/index.js), [delegação](../../packages/remote-mcp/src/agent-scope.js), [OAuth](../../apps/web/app/oauth/consent/route.js) e [composição](../../apps/web/app/compose.jsx).

## Operação, observabilidade e limites

Em 04/11, a descoberta OAuth do MCP estava habilitada no deployment de teste. As flags `COMPOR_AGENT_ENABLED`, `COMPOR_PRIVATE_IMAGES_ENABLED` e `COMPOR_AGENT_MCP_ENABLED` permaneciam desativadas enquanto as verificações reais de Storage, concorrência e integração eram concluídas. Flags controlam disponibilidade, **não substituem identidade, RLS ou autorização**. Os segredos do backend devem permanecer no gerenciador do ambiente; não registrar seus valores nem chaves da pessoa.

As medições persistidas previstas distinguem tentativa de agente, imagem e retomada, com estados e contagens limitadas, sem prompt, chave, imagem ou resposta. A ausência de uso ou de preço significa **desconhecido**, não custo zero. Uma resposta HTTP 202 confirma aceitação, não conclusão do turno; em timeout ou interrupção o efeito e o custo podem ser incertos. Não há teto financeiro por operação comprovado, e a própria conta pode alterar seus registros de medição autorizados. Acompanhamento dos limites, reconciliação e cancelamento: [SCRUM-68](https://compor-mathai.atlassian.net/browse/SCRUM-68).

Os eventos de diagnóstico OAuth são categorias fixas do estágio de retorno, sem registrar no texto URL, código, token ou identificador de autorização. Um evento `response_prepared_303` prova apenas que a resposta foi construída; não prova que o navegador a recebeu ou que o Codex completou a troca. Logs da plataforma podem conter outros metadados e devem ter acesso restrito.

## Evidências e trabalho pendente

- **Esquema e bucket:** o inventário do projeto isolado encontrou 11 entradas na auditoria privada, com hashes correspondentes às 11 migrações versionadas, além das tabelas e RPCs consultadas e do bucket privado. Isso é evidência forte de aplicação; não prova integridade posterior de cada política ou ausência de alterações manuais. A auditoria `compor_migration_audit` é própria desse procedimento e **não é** o histórico da CLI Supabase. Não reaplicar nem executar `supabase db push` sem reconciliar o estado.
- **RLS real com claims sintéticas:** em 04/11 o ensaio do projeto de teste executou verificações de visibilidade própria e cruzada para `projects`, `piece_versions` e `agent_attempts`, aceitou uma inserção no projeto próprio e recusou a inserção cruzada. A evidência mostrou `ROLLBACK`, ausência posterior das fixtures e o marcador `RLS_SYNTHETIC_CHECKS_PASSED_AND_ROLLED_BACK`. O ensaio usa `SET ROLE` e claims sintéticas, não duas sessões JWT autenticadas reais. [Roteiro e SQL](../spikes/2026-11-04-rls-duas-identidades.md).
- **Login e CRUD próprios:** o login Google retornou ao aplicativo, que mostrou conta conectada. Um projeto e uma versão de peça sintéticos foram salvos e apareceram após recarregar a página. Isso não demonstra acesso negado entre duas contas reais.
- **Codex:** OAuth e callback foram concluídos, e uma execução real do Codex chamou `compor-remote.list_projects` e encontrou o projeto sintético criado na web sem usar a chave OpenAI da web. A escrita pelo Codex, a descoberta de peças no serviço real e a transferência de imagem ainda não estavam demonstradas neste registro.
- **OpenAI:** houve ensaios sintéticos anteriores separados de Agents API e Images API, não uma jornada integrada do produto; o custo total efetivo não foi confirmado. [Registro da prova](../spikes/2026-11-03-validacao-sintetica-openai.md).

Antes de afirmar isolamento completo ou abrir a geração a outras contas, demonstrar duas identidades autenticadas reais, leitura/escrita própria e negação cruzada pela API de Storage, MIME/tamanho e políticas preexistentes; testar concorrência com conexões independentes e recuperar resultados incertos; validar Agents API, MCP delegado, geração e fluxo de imagem na Vercel/Supabase reais. Registrar os resultados e eventuais correções sem credenciais, dados de clientes ou traces brutos.
