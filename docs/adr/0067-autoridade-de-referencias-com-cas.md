# ADR 0067 — Autoridade de referências com CAS e consentimento de sessão

- Data: 17/11/2026.
- Estado: banco, rotas e consumidores visuais integrados localmente. A aplicação das migrations remotas e a ativação permanecem pendentes.
- Fonte: Matheus aprovou a alternativa A do [desenho de autoridade](../design/2026-11-17-autoridade-de-referencias-externas-e-geradas.md), sem importação automática de seleções legadas nem limpeza de snapshots. A capacidade de consentimento permanece somente em memória da aba.

## Decisão e dados

A migration `20261117000037_reference_authority.sql` cria um espelho explícito por conta/projeto, comandos idempotentes, consentimentos de sessão e snapshots imutáveis. As tabelas têm RLS e nenhuma permissão direta para `anon`/`authenticated`; RPCs com `search_path` vazio verificam `auth.uid()`, propriedade e escopo. Não são gravados bytes, prompts, URLs de origem, boards, chaves, tokens de autenticação ou preimagens de capacidades. IDs, origens, hashes e revisões são dados persistentes; não há descarte automático.

O espelho contém catálogo ordenado e seleção compartilhada, própria e excluída por post. Leituras sem espelho retornam revisão zero e estado vazio, sem importar sinais nem o IndexedDB. A primeira gravação exige um comando explícito contra a revisão zero. Cada gravação aceita a revisão esperada, incrementa uma vez e guarda o recibo pelo ID do comando. Replay idêntico retorna sua revisão original; conteúdo diferente ou revisão antiga conflita. Não buscar revisão nova para reapresentar silenciosamente uma ação antiga. Escrita SQL e IndexedDB não são uma transação única: o cliente precisa conservar comando/estado pendente e reconciliar o mesmo ID antes de avançar.

A migration 38 permite encerrar um comando pendente pelo mesmo ID. Sob o lock da conta, o servidor devolve o recibo da escrita já aplicada ou registra um bloqueio permanente para o ID. A ausência de recibo, por si só, mantém o comando pendente. Antes de publicar outra seleção diante de conflito, a pessoa revisa a seleção local e a revisão observada no servidor. A confirmação usa CAS contra aquela revisão e pode entrar em conflito se outra aba gravar depois da revisão. A resolução conserva a seleção e os arquivos locais.

`sourceDigest` é SHA-256 dos bytes UTF-8 de `compor-reference-source-v1`, um byte NUL e `JSON.stringify({inputOrigin,source})`, nessa ordem. Fonte local é `null`; externa é `{originUrl,board}`; gerada é `{projectId,imageId}`. O SQL recebe essas fontes brutas, valida sua forma e calcula a projeção; não aceita um digest arbitrário combinado com outro ID gerado. A imagem gerada precisa existir, pertencer à conta/projeto e estar concluída. A origem local é uma declaração de ingestão, não prova da origem física nem de autoria do arquivo.

O conjunto efetivo segue a ordem do catálogo, com referências compartilhadas menos exclusões do post, unidas às próprias. A criação de snapshot exige igualdade integral de IDs/origens/fontes/ordem com esse conjunto. Não representa a triagem posterior do agente, que continua sendo uma subsequência assinada contendo todos os uploads. Posts inexistentes, excluídos ou alheios são recusados. Excluir outro post não apaga o espelho nem invalida, por si só, o conjunto de um escopo ainda ativo.

## Consentimento e sessão

A capacidade é aleatória, de 32 bytes, emitida uma única vez pelo servidor, representada em base64url canônico de 43 caracteres e enviada no cabeçalho `x-compor-reference-consent`. Só seu SHA-256 é persistido. Replay do grant não reemite nem troca a capacidade. Perda da resposta exige reconciliação e um novo gesto para outro consentimento; não gera segredo recuperável.

O servidor HTTP verifica a pessoa por `getUser(token)` antes de operar. O SQL usa apenas o JWT aceito pelo PostgREST, confirma `session_id`, expiração do JWT e a linha correspondente de `auth.sessions` com o mesmo titular e `not_after` válido. Não existe TTL arbitrário adicional. A documentação do Supabase distingue [identidade verificada](https://supabase.com/docs/reference/javascript/auth-getuser) de [ciclo da sessão](https://supabase.com/docs/guides/auth/sessions); uma leitura de claims não verificada não substitui essas condições. Logout/expiração ou dúvida sobre a sessão impedem nova autoridade.

Revogar requer a pessoa autenticada, sem chave OpenAI nem capacidade anterior. A operação instala tombstone mesmo se chegar antes do grant, impedindo que a resposta atrasada ressuscite o consentimento. A capacidade não entra em journal, localStorage ou sessionStorage. Recarregar perde essa autoridade e exige novo gesto; a permissão histórica de busca externa possui contrato próprio e não equivale a autorização visual. Não se promete isolamento contra código hostil na mesma origem ou uma cópia deliberada da capacidade entre abas; o mecanismo comprova posse e registro autenticado, não presença humana.

## Snapshot e admissão

O snapshot vincula conta, projeto, conversa, request, finalidade, lote, revisão de seleção, sessão autenticada e consentimento quando houver referência externa. `parallel` usa o request do planejamento; `replacement` usa o novo ID do filho; `artwork` usa o request do turno de chat. Um ID não pode ser reinterpretado com outro escopo/manifesto. Leituras e replay de snapshots antigos preservam metadados após revogação; não constituem autorização para um efeito novo.

A RPC recebe o JSON canônico **completo** do manifesto. Deriva sua projeção e calcula o hash dos bytes exatos com domínio `compor-visual-input-v1` ou `v2` e separador NUL em `bytea`. Aceitar `entries` selecionadas e um digest independente permitiria forjar esse vínculo, portanto essa interface foi rejeitada. O app ainda valida o schema completo e os bytes transportados: o SQL não decodifica imagens. Os testes comparam os hashes reais SQL/JavaScript.

As wrappers `reserve_exploration_plan_authorized`, `reserve_exploration_batch_authorized`, `replace_exploration_slot_authorized`, `reserve_studio_turn_authorized` e `claim_image_tool_execution_authorized` verificam autoridade e chamam a reserva real na mesma transação, sob o advisory lock por conta já usado pelas intenções e exclusões. A claim da arte confere que `agent_attempt_id` pertence ao turno cujo request criou o snapshot. Receipts existentes continuam idempotentes; não reservam novo efeito após a revogação. A migration 39 usa o mesmo lock para verificar o snapshot visual antes de reabrir a revisão do lote. Consultas do recibo de revisão permanecem disponíveis.

`check_reference_exploration_dispatch` lê autoridade visual e intenção no mesmo lock: `active` para planejamento e `consumed` para lote/reposição. Estado exigido é escolhido pelo adapter do servidor, não pelo navegador. Antes do POST externo, após os demais awaits, essa rechecagem reduz a janela evitável entre duas consultas. A transação não é atômica com a rede: revogação posterior pode coincidir com um envio já admitido. Nunca converter essa corrida em cancelamento comprovado ou retry automático. `unknown` e resultados tardios conservam os recibos individuais.

As RPCs legadas continuam disponíveis para os protocolos serial/MCP; não ganham autorização visual por existir este banco. Os consumidores web visuais usam as wrappers e as guardas antes do fornecedor. O modo visual exige manifesto em novas admissões e conserva a consulta dos recibos antigos. A flag `COMPOR_REFERENCE_AUTHORITY_ENABLED` controla novas operações; consultas e revogação devem continuar acessíveis. Nenhuma flag foi ativada neste checkpoint.

## Evidência e implantação

`scripts/quality/reference-authority.test.mjs` executa migrations reais com Auth/Storage sintéticos no PGlite: CAS/replays, isolamento e acesso direto negado, sessão/capacidade, tombstone, manifesto adulterado, digest, propriedade, reservas de planejamento/lote/reposição/arte, intenção e remoção. `supabase/tests/reference_authority_concurrency.mjs` usa duas conexões independentes num PostgreSQL 17 local exclusivamente da tarefa: observa o segundo processo esperando no advisory lock, testa CAS e ordenações admissão/revogação e revogação/reserva. Nenhuma imagem, sessão paga ou dado real participa.

Essas provas não validam Auth/PostgREST hospedado, integração completa da UI, CI Linux, deploy, custo nem resultado criativo. Aplicar a migration antes das rotas/consumidores e manter novas operações fechadas até a integração revisada. Rollback operacional desliga novos efeitos e preserva tabelas/recibos/snapshots; não remove dados, não transforma pendências em falhas nem reabre protocolos visuais pelo legado. O inventário de migrations inclui o hash exato desta versão.

Este ADR complementa o 0066 com a fonte autoritativa escolhida. Não substitui a triagem assinada, BYOK em memória, os limites visuais nem a recuperação sem reenvio. A ausência de fonte autoritativa continua bloqueante onde a integração ainda não estiver instalada.

## Interface HTTP implementada localmente

`POST /api/studio/reference-authority/{selection,consent,snapshot}` exige mesma origem, JSON estrito (máximo 512 KiB), identidade verificada e propriedade quando houver projeto. `COMPOR_REFERENCE_AUTHORITY_ENABLED=true` habilita `write`, `grant` e `create`; `read`, `receipt`, `fence`, `state` e `revoke` continuam disponíveis com a flag desligada. O adapter usa o JWT da pessoa, RPCs fixas, resposta validada e limite de 1 MiB; falha/perda de resposta retorna `unknown`, sem repetição automática. A flag não substitui disponibilidade das dependências nem habilita geração sozinha.

| Caminho/op | Entrada além de `op` | Saída de sucesso |
| --- | --- | --- |
| selection/read | `projectId` | `{status:'ready',revision,state}` |
| selection/write | `projectId,commandId,expectedRevision,state` | `{status:'applied'|'existing',commandId,revision}` |
| selection/receipt | `projectId,commandId` | `{status:'applied',commandId,revision}`, `{status:'fenced',commandId}` ou `{status:'absent'}` |
| selection/fence | `projectId,commandId` | `{status:'applied',commandId,revision}` ou `{status:'fenced',commandId}` |
| consent/grant | `consentId` | `{status:'granted',consentId,capability}` ou `{status:'existing',consentId}` sem reemitir segredo |
| consent/state | `consentId` | `{state:'active'|'revoked'|'absent',consentId}` |
| consent/revoke | `consentId` | `{status:'revoked',consentId}`, inclusive replay |
| snapshot/create | `projectId,conversationId,requestId,batchId,purpose,selectionRevision,visualInput,consentId?` | `{status:'created'|'existing',snapshot}` |
| snapshot/read | `projectId,requestId` | `{status:'found',snapshot}` ou `{status:'absent'}` |

`state` tem `{version:1,references,projectReferenceIds,posts}`. No write, `references` contém `{id,inputOrigin,source}`; no read, `{id,inputOrigin,sourceDigest}`. Posts contêm `{pieceId,referenceIds,excludedReferenceIds}`. Há limite de 500 itens de catálogo e 500 posts; cada lista de seleção/exclusão tem até 20 IDs, sem duplicatas. `conversationId` é `references` ou UUID; `batchId` é nulo só para `artwork`. `snapshot` contém `requestId,projectId,conversationId,batchId,purpose,selectionRevision,manifestDigest,consentId`, sendo consentId nulo quando não há externas. Não inclui segredo nem bytes. As respostas de recibo são verificadas contra os IDs pedidos.

A intenção e a retomada visual enviam `authorityRequestId` com o manifesto. O valor identifica o snapshot do planejador ou o snapshot próprio da reposição. A execução de arte em `/api/agent/image` usa o `requestId` do turno original. O cliente cria o snapshot antes de admitir essas operações. Quando há referência externa, o cabeçalho de consentimento acompanha novas operações que dependem do snapshot. Consultas de recibos usam a identidade da sessão.

Entradas inválidas retornam 400, falta de identidade 401, consentimento inadequado 403, escopo indisponível 404, conflito 409 e serviço/resultado incerto 503. A resposta perdida depois do commit continua incerta até consultar o mesmo comando/snapshot. `absent` só é produzido após consulta autenticada bem-sucedida, nunca a partir de erro de rede. Consultar metadados não gera imagem nem renova consentimento.

`apps/web/test/reference-authority-route.test.mjs` verifica essas rotas e o adapter, complementado por `scripts/quality/reference-authority-http-bridge.test.mjs`, um bridge HTTP → SQL real no PGlite com perda de resposta após commit, hash canônico, manifesto divergente, revogação e consulta posterior. O bridge simula transporte e Auth; não é uma prova de PostgREST hospedado ou do serviço de identidade real.

### Retirada pela interface

Na tela de referências, **Retirar permissão de geração** descarta a capacidade desta aba antes de aguardar a revogação no servidor. O consentimento anterior fica identificado em memória pelo mesmo `consentId`, inclusive ao fechar/reabrir o painel. Uma resposta perdida mantém o uso bloqueado e oferece **Consultar retirada**; a consulta não repete a revogação nem concede uma capacidade. `active` e `absent` não confirmam retirada e não reabilitam geração. Quando a consulta confirma `active`, um novo gesto pode repetir a revogação idempotente do mesmo ID. Somente depois da confirmação de retirada um novo gesto concede outro consentimento.

O controle de retirada e sua consulta permanecem acessíveis quando a capacidade visual é desligada. Troca de conta/saída limpa a memória, e respostas atrasadas não alteram a permissão da próxima conta. Nenhuma capacidade, chave ou token é gravado em storage; o marcador de retirada também permanece apenas na memória da página, seguindo o tempo de vida do consentimento local. Reload não comprova que a revogação terminou e exige novo gesto para qualquer nova concessão. Recibos anteriores mantêm seus próprios identificadores e consultas. Revogar não prova cancelamento de um pedido que já foi enviado ao fornecedor.

Os testes `reference-authority-consent.test.mjs` e `reference-authority-revoke-browser.test.mjs` cobrem bloqueio imediato, resposta perdida, consulta sem reenvio, remoção da flag, remontagem do painel, isolamento por conta e respostas atrasadas. São fixtures locais sem chamadas pagas.
