# ADR 0028 — Migrations SQL em uma transação

- Estado: recorded.
- Data: 06/11/2026.
- Contexto: Matheus solicitou aplicar migrations por push na `main`, com commit ou rollback do lote e sem criar backup nesta operação.

## Decisão

O workflow usa `scripts/run_atomic_migrations.py` no lugar de `supabase db push`. Os arquivos pendentes e as inserções no histórico nativo `supabase_migrations.schema_migrations` são executados na mesma conexão e transação PostgreSQL. O runner exige um histórico existente cujo prefixo coincida, inclusive conteúdo dos statements, com os arquivos locais e contenha a baseline revisada até `20261105000016`; ele não cria nem repara o histórico. Se houver divergência, não aplica SQL. A baseline dos dados já existentes exige procedimento e evidências próprios.

O parser PostgreSQL valida o conjunto antes de conectar, recusa comandos transacionais explícitos, metacomandos `psql` e operações incompatíveis com o bloco transacional; as dependências do runner são fixadas por versão e hash. O runner serializa o acesso ao histórico com trava consultiva de transação e bloqueio da tabela. Os arquivos pendentes são executados em ordem e os registros de histórico são incluídos antes do único `COMMIT`. Uma repetição após sucesso confirmado não reaplica versões registradas. A trava durável separada do ADR 0027 continua necessária para impedir repetição automática após cancelamento ou resultado incerto.

O runner retorna sucesso somente depois de receber confirmação de `COMMIT`. Perder a resposta durante ou após o commit deixa o resultado desconhecido; não se libera a trava durável nem se repete até consultar o histórico e o esquema. Também é possível perder a confirmação da liberação após commit confirmado: nesse caso a trava pode estar livre ou ocupada e deve ser inspecionada.

A operação `bootstrap` do workflow é exclusivamente manual na `main` e exige `SUPABASE_MIGRATIONS_BOOTSTRAP_ENABLED=true`, além das verificações de destino e TLS usadas na aplicação. Ela gera o SQL da baseline a partir do commit exato e o executa com `psql -X` e `ON_ERROR_STOP=1`; não é disparada por push nem cria backup. Depois do resultado confirmado, desative ou remova a variável. Se o resultado for desconhecido, inspecione namespaces, histórico e auditoria antes de qualquer repetição.

## Evidência e limites

A CLI Supabase 3.0.0 aplica arquivos individualmente: em ensaio sintético PostgreSQL 17, uma falha na migration 21 deixou 17–20 confirmadas. No mesmo tipo de banco sintético, a execução transacional do lote desfez as alterações e registros 17–21 na falha, preservou dados anteriores, aplicou nove migrations no sucesso, aplicou zero no rerun e recusou histórico divergente e concorrência. O scanner `pglast` 7.22 reproduziu os arrays `statements` da CLI 3 byte a byte para os 26 arquivos conhecidos.

Rollback SQL não reverte efeitos externos de funções ou triggers, mensagens de log já emitidas, operações de sequence nem efeitos produzidos fora da conexão. A análise desses efeitos foi separada na [issue 19](https://github.com/MathBorgess/compor/issues/19). O parser não constitui auditoria semântica de SQL ou prova de ausência de efeitos externos; migrations e triggers continuam exigindo revisão. Não foi criado backup nesta operação, por decisão de Matheus. Os testes sintéticos não comprovam o estado ou as permissões do banco de produção.

Esta decisão substitui no ADR 0027 o uso de `supabase db push` para aplicação, mantendo a trava persistente e a necessidade de identificar o destino e reconciliar o histórico. O deploy Vercel continua independente e precisa ocorrer após a confirmação das migrations quando houver dependência entre eles.
