# ADR 0061 — Lotes paralelos e recibos de planejamento

- Estado: implementação local da camada de banco; migração remota não aplicada.
- Decisão: Matheus, em 17/11/2026, aprovou o [desenho revisado](../design/2026-11-17-exploracao-paralela-com-planejamento-do-agente.md), iniciar três imagens juntas, preservar somente os 15 segundos após o lote inteiro e recusar temporariamente exclusão durante efeitos pendentes.
- Complemento aprovado: preservar sucessos parciais e permitir reposição explicitamente solicitada de slot definitivamente recusado, com novo ID. Resultado desconhecido continua bloqueante.

## Parte substituída e limites

O despacho sequencial do ADR 0029 é substituído por um lote autorizado de três filhos. Consentimento, escolha da credencial, fatos da oferta, revisão após duas rodadas e isolamento continuam vigentes. A migração sozinha não muda o cliente nem aciona geração. O planejamento de três prompts pelo agente e o coordenador HTTP são camadas separadas, que precisam validar o contexto e a prova da mesma fonte/credencial antes de usar estas RPCs.

Paralelismo permite sobrepor trabalho do provedor; não garante redução de latência, custo, quota ou tempo total. A observação de 15,2 segundos de uma imagem é uma amostra, não SLA. Não existe intervalo de 20 segundos entre inícios.

## Reserva e exclusividade

A migration `20261117000033_exploration_parallel_batches.sql` acrescenta `exploration_planning_attempts`, `exploration_batches`, `exploration_batch_slots`, `exploration_images.parallel_batch_id`, `replaces_image_id` e `revision`.

A reserva do lote cria três slots, três recibos de imagem e três compromissos de prova na mesma transação. Cada slot conserva o ID inicial e o atual. Uma falha em qualquer inserção desfaz a reserva inteira. IDs, plano, projeto, post e prompts precisam coincidir no replay; este retorna `is_new=false`, ignora digests de provas novos e não concede outro despacho. A reserva exige um planejamento `completed` do mesmo lote/escopo.

O advisory lock por conta continua sendo a autoridade de admissão de planejamento, imagens antigas/MCP, foreground e lotes. O índice antigo de um recibo incerto por conta é substituído por um trigger que permite coexistência somente entre os três membros já registrados do mesmo lote. O índice de lote aberto admite no máximo um por conta. Um lote de outro projeto ou aba não é uma extensão do lote atual. Outras contas seguem independentes.

Planejamento `starting`/`running` impede novas reservas; `unknown` bloqueia. Foreground conserva a prioridade da sua lease. Um lote parcial conhecido impede outro lote exploratório até reposição explícita ou exclusão explícita do seu escopo; não impede edição quando não há imagem pendente. Contadores de tempo não liberam trabalho desconhecido.

## Contrato das RPCs

Parâmetros com IDs são UUIDs; digests são 64 caracteres hexadecimais minúsculos. `piece_id=null` corresponde à conversa `references`; qualquer outro post precisa existir, estar ativo e pertencer ao projeto. Identidade vem de `auth.uid()` e a propriedade é revalidada em cada mutação. Segredos são preimagens hexadecimais de 32 bytes, comprometidas por SHA-256 dos bytes.

| RPC | Parâmetros na ordem | Resultado |
| --- | --- | --- |
| `reserve_exploration_plan` | `p_project_id,p_piece_id,p_batch_id,p_request_id,p_input_digest,p_completion_digest` | `{status:'reserved'\|'existing',record}` ou `{status:'busy'\|'conflict'\|'not_found'}` |
| `get_exploration_plan` | `p_project_id,p_request_id` | `record` próprio ou `null` |
| `bind_exploration_plan` | `p_project_id,p_request_id,p_binding,p_completion_secret` | boolean |
| `finish_exploration_plan` | `p_project_id,p_request_id,p_state,p_completion_secret` | boolean |
| `reserve_exploration_batch_proven` | `p_project_id,p_batch_id,p_piece_id,p_plan_digest,p_image_ids,p_prompt_digests,p_rejection_digests` | uma linha `{state,is_new}` |
| `get_exploration_batch` | `p_project_id,p_batch_id` | lote próprio ou `null` |
| `replace_rejected_exploration_batch_slot_proven` | `p_project_id,p_batch_id,p_position,p_previous_id,p_id,p_prompt_digest,p_rejection_digest` | uma linha `{state,is_new}` |

`record` contém `userId,projectId,conversationId,batchId,requestId,attemptId,inputDigest,state,binding`; não contém segredo nem digest da capacidade. A tabela privada não é legível diretamente por `authenticated`. O binding de sessão, IDs e estado persistem após conclusão para permitir GET de recuperação sem refazer planejamento.

O primeiro bind válido faz `starting → running`. Uma prova errada retorna `false`. `completed` admite `running`/`unknown` com a prova original; `failed` admite somente `running` com prova. Ambos consomem o compromisso. `unknown` só torna `starting`/`running` mais conservador e aceita segredo nulo. Um estado solicitado pelo browser não libera tentativa paga. Confirmação perdida exige GET; não se repete a chamada paga nem se instala prova nova. `starting` sem binding após perda da resposta de criação permanece bloqueante, pois o banco não consegue inventar uma sessão recuperável.

Reserva de lote recebe arrays unidimensionais, de base 1, exatamente três elementos; a ordem define posições 1–3. Estados de admissão são `busy`, `blocked`, `partial`, `awaiting_feedback` e `cooldown`, todos com `is_new=false`. Novo lote retorna `running,true`; replay retorna o estado durável do lote com `false`.

O GET do lote retorna `batch_id,project_id,piece_id,plan_digest,state,created_at,updated_at,completed_at,next_at,closed_at` e `images`, ordenadas por posição. Cada imagem contém `id,project_id,prompt_digest,state,ordinal,revision,batch_position,replaces_image_id,created_at,updated_at`. Provas não entram no GET. Recibos anteriores à reposição permanecem em `exploration_images`.

## Conclusão, parcial e revisão

`complete_exploration_image_proven`, `reject_exploration_image` e `finish_exploration_image(...,'unknown')` conservam a prova individual. Completar exige objeto no Storage e prova; recusar exige prova e estado `running`; `unknown` não vira recusa. Perder resposta HTTP, encerrar navegador ou abortar fetch não prova cancelamento no provedor.

Cada transição de estado incrementa `revision`, começando em 1, sob o lock. O valor é bigint limitado ao maior inteiro seguro do JavaScript. `updated_at` é observabilidade, não ordem causal. O cliente deve ignorar uma revisão antiga; a reposição tem outro ID e sua revisão começa novamente em 1.

A agregação consulta os três IDs atuais: algum `unknown` dá `unknown`; senão algum `running` dá `running`; três `completed` dão `completed`; os demais casos são `partial`. Cada sucesso permanece acessível independentemente das outras respostas. Somente três conclusões confirmadas iniciam `completed_at` e `next_at=completed_at+15s`, usando o relógio do servidor no término verificável, não o início da transação. Novo lote do mesmo projeto respeita esse deadline; foreground não espera o cooldown.

Reposição exige que os três resultados atuais já sejam terminais conhecidos, o slot atual seja `rejected`, não haja trabalho incerto/ativo da conta nem lease foreground e o prompt continue idêntico ao slot. Cria novo recibo/prova, registra `replaces_image_id` e mantém os sucessos. Solicitação explícita e validação da credencial continuam responsabilidade do endpoint. Repetir a mesma reposição retorna o recibo existente sem novo despacho.

O gate conta uma rodada por `batch_id` quando seus três slots atuais completam, independentemente da ordem de chegada. As imagens recebem epoch/número da rodada já na reserva, permitindo que seleção/comentário de um sucesso precoce engaje aquela rodada. Não se contam rejeições ou unknown como rodada completa. Ao migrar de um fragmento serial histórico, abre-se um novo número de rodada sem transformar o fragmento em rodada completa nem apagar rodadas já contadas. O gate de duas rodadas e a retomada explícita existentes permanecem.

## Exclusão e compatibilidade

Excluir projeto ou post usa o mesmo owner lock antes do lock da linha do projeto. Com planejamento ou imagem `running`/`unknown` (incluindo `starting` do planner), retorna `{status:'pending'}`. Turnos antigos do estúdio sem post definido bloqueiam conservadoramente todo o projeto; exploração antiga sem post também bloqueia exclusão de qualquer post daquele projeto. Foreground tem o post da reserva. A admissão de turno antigo e a execução foreground agora recusam projeto excluído; a recuperação de recibos existentes continua disponível.

Sem pendências, exclusão lógica preserva imagens, provas, histórico e resultados. Lotes `partial` daquele escopo recebem `closed_at`: a exclusão explícita encerra a possibilidade de reposição e libera o índice de lote aberto, sem declarar imagens concluídas nem apagar recusas. Não se fecha lote `running`/`unknown`. Isso evita prender a conta a um post que já foi excluído.

Clientes antigos continuam usando estados conhecidos: parcial aparece como `awaiting_feedback` e cooldown como `busy` na reserva serial. Não podem furar lote aberto, planner ativo ou unknown. Colunas históricas, ordinais, sinais, proofs já emitidos e recibos sem batch permanecem. Nenhuma prova é criada retroativamente.

## Publicação, rollback e evidência

A implantação é incremental: aplicar banco após revisão e gate; publicar backend capaz de recuperar os recibos; habilitar cliente somente após validar planner/coordenador/provas e recuperação. Uma instalação antiga continua serial e pode ser bloqueada por pendência nova, que precisa ser reconciliada por um backend compatível. Desligar o cliente paralelo deve impedir novos lotes, mantendo a recuperação dos existentes.

Rollback de uma transação de migration restaura o índice antigo, funções e dados. Depois de novos lotes em uso, rollback operacional é desligar novos despachos e preservar esta migration/recuperação; não recriar o índice de um recibo enquanto houver três pendências, não apagar slots e não reabrir unknown. Uma eventual reversão de schema exige procedimento próprio depois de reconciliar cada recibo, sem converter incerteza em falha.

A [evidência local](../quality/2026-11-17-exploracao-paralela-sql.md) distingue PGlite, PostgreSQL concorrente, stubs Auth/Storage e integração ainda não executada. Não foram feitas chamadas pagas, migrations remotas ou deploy.
