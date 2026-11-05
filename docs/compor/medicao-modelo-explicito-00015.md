# Medição por modelo explícito — migração 00015

Em 5 de novembro de 2026, Matheus determinou o uso de `gpt-6.1-terra` no agente.
As migrações `00009` e `00012` só permitem `gpt-6-astra` para etapas de agente, e
as RPCs antigas gravam Astra de forma fixa. Alterar somente o modelo da chamada
OpenAI manteria uma medição incorreta ou impediria a reserva antes do envio.
Por isso a mudança também exige um contrato de banco versionado.

## Contrato e compatibilidade

Nova RPC:

```text
start_usage_measurement_v3(
  p_project_id uuid,
  p_attempt_id uuid,
  p_part text,
  p_part_id uuid,
  p_model text
) → boolean
```

| `p_part` | Modelos aceitos | Vínculo exigido |
| --- | --- | --- |
| `agent` | `gpt-6-astra`, `gpt-6.1-terra` | `part_id = attempt_id`, tentativa iniciada e projeto próprio |
| `agent_resume` | `gpt-6-astra`, `gpt-6.1-terra` | Submissão própria em `sending`, execução concluída, tentativa iniciada |
| `image` | `gpt-image-2.5-flare`, `gpt-image-2.6-flare` | Execução própria em `running`, reserva e tentativa correspondentes |

O modelo é obrigatório e a combinação parte/modelo é validada antes de qualquer
gravação. A RPC conserva a ordem de travas de execução → tentativa → submissão
da v2, verifica a conta e o proprietário do projeto e concede execução somente
a `authenticated`. Não concede escrita direta na tabela.

Retorna `true` somente para uma inserção nova. Repetir a mesma chave retorna
`false`, inclusive se outro modelo for informado: a medição existente não é
reclassificada. Combinações inválidas, tentativa terminal, usuário anônimo ou
recurso de outra conta são recusados.

As RPCs `start_usage_measurement` e `start_usage_measurement_v2`, assim como
`finish_usage_measurement`, permanecem com os corpos originais. A v1 continua
registrando Astra/imagem 2.5; a v2 continua registrando Astra/imagem 2.6. A
migração amplia a constraint e cria uma função; não contém `UPDATE` de histórico.

## Uso no backend

O backend seleciona `p_model` a partir do modelo efetivamente enviado ao
provedor, sem aceitar uma substituição arbitrária pelo payload da pessoa.

- Criação nova com Terra: reservar via v3 com `p_part=agent` e
  `p_model=gpt-6.1-terra` antes da chamada paga.
- Consulta e conclusão de sessão antiga: consultar o mesmo recurso; terminar a
  medição existente não precisa receber modelo e preserva o valor armazenado.
- Retomada de sessão antiga: usar o modelo observado na sessão verificada ou em
  sua medição vinculada. O novo default do ambiente não comprova que uma sessão
  Astra passou a usar Terra.
- Imagem: pode continuar usando a v2 para imagem 2.6; a v3 também aceita o modelo
  explícito correto. A chave web continua apenas na sessão da aplicação.

Se a v3 não estiver disponível, uma reserva que exija Terra deve falhar antes do
envio ao provedor. Não fazer fallback silencioso para v2/Astra. O banco verifica
o catálogo permitido e a autorização, mas não atesta por si só qual modelo foi
executado pela OpenAI. Contagens, estimativas e cobrança confirmada continuam
sendo evidências diferentes. Esta migração não introduz preços para Terra; o
custo do agente permanece desconhecido quando não há tabela de preços validada.

## Preparação e aplicação no projeto de teste

Não modificar os pacotes já aplicados de `00013`/`00014`. O novo preparador exige
as **15 entradas existentes** da auditoria e adiciona apenas `00015`, chegando a
16. O blob revisado vem do commit `ea0424907af132243ce040d0edfd8f47b8304955`, com
SHA-256 `d0b672c2454e8275a899480dbe852e1e5ef1fc3cf6a1d422e96c26ec0fa799c3`.

Executar na raiz do repositório, sem conectar ao banco:

```sh
python3 -B scripts/prepare_usage_model_v3_migration.py
python3 -B scripts/prepare_usage_model_v3_migration.py --proof
```

Revisar os arquivos privados indicados pelo JSON. Depois, um único comando e uma
única senha executam aplicação e prova no mesmo processo `psql`:

```sh
sh scripts/apply_usage_model_v3_test_project.sh /caminho/absoluto/apply.sql /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

O wrapper fixa o projeto `dpboawdnuxuzjoufpiry`, a CA oficial, TLS `verify-full`,
`psql -X -W`, `ON_ERROR_STOP` e ambiente sem `PG*` herdadas. Valida ambos os
arquivos byte a byte antes de conectar. Exige `COMMIT` da migração e `ROLLBACK`
da prova. Se a prova falhar depois do `COMMIT`, a migração já está aplicada:
inspecionar a evidência e não repetir aplicação. Para executar somente a prova:

```sh
sh supabase/tests/usage_model_v3_rls_capture.sh /caminho/absoluto/proof.sql /caminho/absoluto/supabase-ca.crt
```

## Guardas e verificação

O pacote reutiliza as guardas revisadas da auditoria e de tabelas/índices sem
alterar seus arquivos anteriores. Confere a constraint exata da v2 antes do DDL,
a constraint v3 depois dele, os corpos e permissões das RPCs antigas e nova,
RLS e ausência de escrita direta. Há trava consultiva, travas das tabelas
envolvidas, `lock_timeout=5s` e `statement_timeout=30s`.

A prova preserva os testes de aprovação, linhagem e isolamento do estúdio e
acrescenta duas identidades exercitando Terra, Astra, imagens 2.5/2.6, retomada,
idempotência, modelo inválido, negação cruzada e ausência de escrita direta.
Executa apenas fixtures sintéticas de metadados; não cria arquivos nem chama a
OpenAI. Snapshots SHA-256 das onze tabelas envolvidas e da auditoria devem ser
iguais depois do `ROLLBACK`; acima de 10 mil linhas a prova para antes das
fixtures. A captura só passa com
`USAGE_MODEL_V3_RLS_CHECKS_PASSED_AND_ROLLED_BACK`.

```sh
cd packages/private-images
node --test test/usage-model-v3-sql.test.mjs test/usage-v3-prepare-apply.test.mjs
```

Os testes isolados comprovam preservação exata das linhas históricas, ausência
de mudança nas RPCs antigas, auditoria 15→16, rollback de DDL em falha, recusa de
drift e execução real por `psql` local com dois arquivos na mesma conexão. Não
substituem autenticação JWT real, concorrência entre conexões independentes,
verificação do modelo pelo provedor ou cobrança real.
