# Identificadores de chamadas do provedor — migração 00016

Em 5 de novembro de 2026, a consulta de uma sessão existente mostrou uma chamada
`compor_contexto` com identificador iniciado por `exec_`. O contrato local aceitava
somente `call_`, impedindo o vínculo com as reservas e os recibos do banco. A
mensagem de falha da ferramenta, isoladamente, não comprova timeout.

## Contrato e inventário

O identificador permanece opaco: aceitar `^(call|exec)_[A-Za-z0-9_-]{1,128}$`,
sem trocar prefixos nem alterar caixa. São até 133 caracteres no total. O limite
é uma decisão local, não uma garantia de formato da OpenAI. A migração altera
somente os três pontos que restringiam o prefixo no SQL:

| Ponto | Alteração |
| --- | --- |
| `studio_action_submissions.call_id` | Constraint v2 permite ambos os prefixos |
| `claim_studio_action(uuid,uuid,text,text,text,text)` | Validação permite ambos os prefixos |
| `reserve_image_tool_call(uuid,uuid,integer,uuid,text,text,text)` | Validação permite ambos os prefixos |

`get_studio_action`, `mark_image_tool_call_unknown` e
`claim_image_tool_result_submission` já usam igualdade exata. Consentimento,
execução e conclusão usam os UUIDs dos recursos vinculados. Esses componentes
não precisam ser alterados. A igualdade exata de sessão, turno, chamada,
projeto, peça, versão e tentativa continua obrigatória; `exec_x` e `call_x` são
chamadas diferentes. O backend deve preservar a mesma identidade no HMAC e na
comparação com a ação pendente do provedor.

As verificações de `auth.uid()`, proprietário, estados, ordem de travas,
idempotência e conflito de digests são preservadas. Somente `authenticated`
executa as RPCs; não há concessão de escrita direta. A migração não contém
`UPDATE` de histórico nem altera as migrações anteriores.

## Pacote de aplicação ao projeto de teste

O preparador exige as **16 entradas exatas** da auditoria existente e acrescenta
somente `00016`, totalizando 17. O blob revisado vem do commit
`2375eab3f390a5343a32abf78ab1df01736e0f3a`, com SHA-256
`997f7e476b3347f397381c743940ac5c83fa7b6da907d4677516cb02af035c54`.

Gerar os dois arquivos privados, sem conexão ao banco:

```sh
python3 -B scripts/prepare_provider_call_ids_migration.py
python3 -B scripts/prepare_provider_call_ids_migration.py --proof
```

Após revisão, um comando aplica e prova na mesma conexão, com uma única senha:

```sh
sh scripts/apply_provider_call_ids_test_project.sh /caminho/absoluto/apply.sql /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

O wrapper fixa o projeto de teste `dpboawdnuxuzjoufpiry` pela conexão com o host
`db.dpboawdnuxuzjoufpiry.supabase.co`, confere a CA oficial e os bytes de ambos os
arquivos, usa TLS `verify-full`, ambiente sem variáveis `PG*` herdadas,
`psql -X -W` e `ON_ERROR_STOP`. Reutiliza as guardas revisadas de tabelas,
índices, callbacks, defaults, funções, RLS e auditoria sem alterar os pacotes
anteriores. Confere nomes e expressão da constraint, corpos e contratos das
RPCs antes e depois do DDL. Há `lock_timeout=5s` e `statement_timeout=30s`.

Se a prova falhar depois de `COMMIT`, a migração já está aplicada: não repetir a
aplicação. Inspecionar a evidência e executar somente a prova após a correção:

```sh
sh supabase/tests/provider_call_ids_rls_capture.sh /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

## Evidência e limites

A prova conserva aprovação, linhagem, medição por modelo e isolamento anteriores.
Acrescenta duas identidades com `exec_`, replays idempotentes, digests conflitantes,
negação entre contas, limites de tamanho, preservação de prefixos distintos,
estado incerto sem reinício e ausência de escrita direta ou acesso anônimo.
Executa apenas metadados sintéticos com `ROLLBACK`: não chama a OpenAI e não
insere arquivos em Storage. Snapshots de contagens e SHA-256 das onze tabelas e
da auditoria devem ser idênticos após o rollback; acima de 10 mil linhas a prova
para antes das fixtures. A captura exige `COMMIT`, `ROLLBACK` e
`PROVIDER_CALL_IDS_RLS_CHECKS_PASSED_AND_ROLLED_BACK`.

```sh
node --test packages/private-images/test/provider-call-ids-sql.test.mjs packages/private-images/test/call-ids-prepare-apply.test.mjs
```

Os testes locais verificam preservação byte a byte de linhas `call_` anteriores,
auditoria 16→17, recusa de reaplicação e drift, rollback de DDL em falha e um
processo `psql` com aplicação e prova. Um teste isolado adicional cobre
consentimento → execução → resultado → recibo de imagem com `exec_`, usando
apenas uma linha de Storage falsa no PGlite. Isso não comprova JWTs reais,
Storage remoto, concorrência entre conexões, execução de ferramenta no provedor
ou geração real de imagem. A confirmação de funcionamento exige reconciliar a
sessão já existente e validar o fluxo autorizado sem reenvio automático.
