# ADR 0064 — Retomada paralela vinculada à intenção

- Data: 17/11/2026
- Status: implementado localmente; migration remota não aplicada
- Escopo: retomada explícita do gate após duas rodadas no caminho paralelo

## Problema

O controlador paralelo em integração usava a retomada serial de feedback antes de criar sua intenção. Essa RPC histórica verifica titularidade e pendências, mas não conhece a intenção revogável. Uma chamada atrasada poderia limpar o gate depois de uma pausa confirmada em outra aba.

## Decisão

A migration aditiva `20261117000036_exploration_parallel_review.sql` cria uma operação própria para o fluxo paralelo. O gesto explícito cria uma única intenção e recebe seu epoch; quando precisa retomar o feedback, chama a nova operação antes de reservar o planejamento. Próximas rodadas automáticas não retomam o gate. O servidor deriva a mesma capability de propósito `batch` vinculada à conta, projeto, conversa, lote, contexto, fonte e credencial; o navegador nunca recebe sua preimagem.

`resume_exploration_parallel_review(p_project_id,p_piece_id,p_batch_id,p_intent_id,p_intent_secret,p_expected_epoch)` toma o mesmo advisory lock da conta usado por criação, revogação, reserva e exclusão. Verifica projeto/post ativos, escopo, propósito, prova, intenção `active` no epoch atual e `p_expected_epoch` igual ao epoch devolvido na criação. Só depois pode retomar o gate. Planner ou imagem ativo/desconhecido, lease foreground e lote parcial aberto impedem a mutação. O prazo de 15 segundos não é alterado e continua sendo aplicado na admissão paga.

| Resultado | Significado |
| --- | --- |
| `{status:'resumed',intentEpoch,reviewEpoch}` | O pedido limpou o gate e gravou seu recibo |
| `{status:'not_paused',intentEpoch,reviewEpoch}` | O gate já estava liberado quando o pedido foi registrado |
| `{status:'revoked'}` | A intenção/prova/escopo não autoriza essa retomada |
| `{status:'conflict'}` | O epoch esperado difere da intenção própria naquele escopo |
| `{status:'blocked'}` | Existem pendências incompatíveis; nenhum recibo foi criado |
| `{status:'not_found'}` | Projeto/post indisponível para o titular |

A intenção guarda privadamente `review_resume_status` e `review_resume_epoch`. Cada intenção pode tratar o pedido uma única vez, inclusive quando o resultado inicial é `not_paused`. Replay com capacidade ainda ativa devolve o recibo original e não toca o gate, mesmo se ele voltou a pausar. Isso impede que uma mesma solicitação libere outro ciclo de feedback. O epoch de autorização e o estado da intenção não mudam na retomada; o recibo não consome a intenção.

`get_exploration_parallel_review(p_project_id,p_intent_id)` retorna o recibo `{status,intentEpoch,reviewEpoch}` ou `null` quando não existe ou está fora do escopo próprio. É somente leitura, dispensa a chave anterior e continua acessível depois de revogação, consumo ou exclusão lógica. A leitura não prova intenção ativa e não autoriza planejamento ou imagens. Após resposta perdida, consulta-se esse recibo; ausência pode ser uma transação ainda em trânsito, portanto não prova que a retomada falhou nem autoriza repetir automaticamente. Os controles de revogação e CAS dos ADRs [0061](0061-lotes-paralelos-e-recibos-de-planejamento.md) e [0063](0063-epoch-original-da-revogacao.md) permanecem necessários.

## Corridas, compatibilidade e limites

Se a revogação vence a trava, a retomada paralela retorna `revoked` e conserva o gate. Se a retomada vence, seu recibo pode confirmar a liberação anterior; a revogação posterior ainda bloqueia o planejamento/despacho por aquela intenção. Não se tenta desfazer um reset confirmado nem declarar cancelamento externo. Uma nova intenção exige o pedido explícito e o CAS correspondente.

`resume_exploration_review` e seus endpoints históricos permanecem iguais para serial/MCP. Este ADR substitui apenas o uso dessa retomada pelo novo controlador paralelo. Não promete que uma chamada autorizada do caminho legado passou a depender de intenção; a admissão paralela continua protegida mesmo quando um cliente legado interage com o gate compartilhado.

Os adapters e o cliente devem ser publicados com o contrato novo antes de habilitar o fluxo. Migration ausente deve falhar fechada. Os recibos históricos de intenção permanecem sem retomada (`null`), sem reconstrução retroativa. Uma falha na transação desfaz gate e recibo juntos. Rollback operacional desliga novas admissões paralelas e preserva a recuperação e as colunas; não remove a prova nem redireciona silenciosamente o fluxo ao endpoint legado.

## Evidência

Regressões locais exercitam provas e escopos inválidos, CAS, revogação nas duas ordens, replay sem limpar ciclo posterior, `not_paused`, pendências, rollback, RLS e exclusão. PostgreSQL com conexões independentes e barreiras no advisory lock verifica a serialização real. Resultados e limites ficam na [evidência SQL](../quality/2026-11-17-exploracao-paralela-sql.md). Não foram feitas chamadas pagas, migrations remotas ou deploy.
