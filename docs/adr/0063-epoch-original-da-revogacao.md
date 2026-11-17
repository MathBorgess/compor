# ADR 0063 — Epoch original da revogação

- Data: 17/11/2026
- Status: implementado localmente; migration remota não aplicada
- Escopo: evidência de revogação da intenção paralela e CAS de uma nova intenção

## Problema

No [ADR 0061](0061-lotes-paralelos-e-recibos-de-planejamento.md), a revogação idempotente e a consulta de estado retornavam apenas o epoch atual da conta. Se outra aba criasse e depois revogasse uma intenção, o replay da revogação antiga passaria a mostrar essa versão mais recente. Usá-la na criação de uma intenção substituta permitiria que a aba antiga adotasse uma mudança que não observou no seu pedido original.

## Decisão

A migration aditiva `20261117000035_exploration_revocation_epoch.sql` acrescenta `revocation_epoch` nullable ao tombstone. A revogação e a exclusão lógica que revoga uma intenção registram o novo epoch na mesma transação, sob o mesmo advisory lock da conta. Replays não alteram o tombstone nem incrementam o epoch. Identidade, escopo, prova de admissão e CAS de criação permanecem os mesmos.

| Resposta | Contrato após migration35 |
| --- | --- |
| `revoke_exploration_intent`, revogação confirmada | `{status:'revoked',epoch,revocationEpoch}` |
| `revoke_exploration_intent`, conflito/escopo ausente | `{status:'conflict',epoch}` ou `{status:'not_found'}`, sem alteração |
| `get_exploration_intent_state`, escopo próprio | `{state,epoch,revocationEpoch}` |
| `get_exploration_intent_state`, escopo alheio | `null`, sem alteração |

`epoch` é a versão atual da conta no snapshot da consulta. `revocationEpoch` é o epoch original da revogação daquele ID e não muda quando outra aba avança a conta. É `null` para estados sem tombstone e para tombstones anteriores à migration35: a versão histórica é desconhecida e não será inferida de timestamps, da intenção ou do epoch atual. Uma consulta ou replay posterior não preenche esse valor.

Uma reemissão vinculada à revogação usa exclusivamente `revocationEpoch` como `expectedEpoch`; `null` mantém essa retomada bloqueada. Se outra intenção tiver avançado a conta, o CAS retorna conflito, mesmo que ela já tenha sido revogada e não exista intenção ativa. Não substituir a versão rejeitada por uma leitura atual e repetir automaticamente. Um novo pedido explícito pode começar outro fluxo com a versão então observada; isso não é recuperação da autorização antiga.

Exemplo: revogação A produz 2; outra aba cria B em 3 e revoga B em 4. Replay/GET de A retornam `epoch:4,revocationEpoch:2`. A reemissão com `expectedEpoch:2` é recusada. O resultado não prova cancelamento de uma imagem admitida ou enviada.

## Compatibilidade, rollout e rollback

Este ADR substitui somente a interpretação de epoch da resposta de revogação/estado do ADR 0061; preserva seus demais limites e recibos. Adapters com schemas estritos precisam aceitar o campo adicional antes de habilitar o fluxo com migration35. Adapters novos devem tratar ausência histórica como prova desconhecida, sem adotarem `epoch` como fallback. O cliente paralelo continua condicionado ao gate de ativação e às verificações de integração.

Não há backfill nem alteração dos hashes das migrations anteriores. RLS e grants continuam impedindo leitura/escrita direta dos tombstones por clientes. Uma falha na transação desfaz epoch, tombstone e revogação juntos. Após uso, rollback operacional desabilita novas admissões e conserva coluna/evidência e recuperação; não apagar a prova nem voltar a usar epoch atual como se fosse o original.

## Evidência

Os testes de regressão executam SQL real em PGlite com Auth/Storage sintéticos, incluindo tombstone legado, replay após atividade de outra aba, CAS antigo, exclusão de post/projeto, rollback e isolamento entre titulares. O teste local de PostgreSQL usa conexões independentes e barreiras no advisory lock para revogação duplicada, criação/revogação nas duas ordens e replay concorrente com intenção nova. Resultados e limites ficam na [evidência SQL](../quality/2026-11-17-exploracao-paralela-sql.md); não equivalem a integração remota ou cancelamento no fornecedor.
