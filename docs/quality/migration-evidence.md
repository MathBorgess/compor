# Evidência offline dos históricos de migrations

`scripts/inspect_migration_evidence.py` compara um inventário de metadados com os blobs de um commit Git imutável. Não conecta a banco, gera SQL, altera histórico, faz `repair` ou autoriza aplicação. Seu resultado é sempre `safe_to_apply: false` e nunca termina com código de saída zero: `1` indica divergências, `2` entrada inválida e `3` nenhuma divergência detectada no material fornecido. Nenhum desses estados autoriza implantação.

O mecanismo compara versões, nomes e SHA-256 dos arquivos registrados na auditoria legada com os bytes no commit escolhido e com os objetos de origem. Detecta fontes indisponíveis, versões desconhecidas, divergências, lacunas, linhas omitidas e duplicatas. Também compara mapas de hashes de catálogo fornecidos separadamente. A ausência da tabela nativa com auditoria legada presente é explicitamente sinalizada: a CLI poderia considerar as migrations pendentes. Não confunda `compor_migration_audit.applied` com `supabase_migrations.schema_migrations`; a segunda não prova os hashes dos arquivos nem os efeitos das operações.

No código da CLI 2.84.2, a [listagem do histórico](https://github.com/supabase/cli/blob/v2.84.2/pkg/migration/list.go) trata uma tabela ausente como lista vazia, e a [seleção das migrations pendentes](https://github.com/supabase/cli/blob/v2.84.2/pkg/migration/apply.go) compara versões. Essas propriedades não estabelecem compatibilidade com qualquer banco concreto.

Igualdade dos mapas de catálogo não prova que eles sejam completos, atuais, que os hashes correspondam ao banco, ou que o esquema seja seguro. Este conjunto ainda não implementa um coletor ou canonicalizador de catálogo: seus hashes são fornecidos pelo operador e precisam de procedimento independente revisado. Uma revisão independente deve definir referência confiável e cobrir tabelas, colunas, constraints, índices, RLS, políticas e suas expressões, privilégios, triggers, funções e seus corpos, configurações de segurança e buckets. Confirme identidade do projeto por canal independente, versão do PostgreSQL, ACL e existência de alterações manuais. Uma captura falsa ou incompleta pode produzir igualdade. Não inclua conteúdo criativo, linhas de aplicação, tokens, senhas, URLs de conexão ou corpos de funções na evidência compartilhada.

O histórico do piloto não confirma ordem somente pelos números: a documentação registra aplicação de 00012 antes de 00011, e `applied_at` das migrations agrupadas na mesma transação pode coincidir. Uma lista completa, ordenada nominalmente, não estabelece a ordem real. Incluir `SOURCE_COMMIT` e SHA não prova que a operação ocorreu. Alguns `SOURCE_COMMIT` históricos não estão disponíveis; os scripts históricos usam `READ_COMMIT` distinto para recuperar bytes. A ferramenta não os substitui silenciosamente: uma origem indisponível é divergência a investigar, não prova de corrupção do banco.

## Captura e formato

O arquivo `supabase/tests/migration_histories_readonly.sql` é uma coleta somente de metadados dos históricos; leia-o e revise o destino antes de usar. Sua execução é separada e requer acesso de leitura autorizado. Ela valida forma, privilégios e locks, e retorna `unverified` se não conseguir ler com segurança. Não execute enquanto houver alterações de schema, papéis ou privilégios concorrentes. Nenhuma leitura foi feita em produção por este procedimento. O antigo `preflight_readonly.sql` filtra versões com formato diferente e não é inventário completo; não use uma listagem filtrada como prova de ausência de outras linhas.

**Limitação de privilégios:** para ler o histórico legado, essa captura exige `current_user = 'postgres'`, `BYPASSRLS` e que o próprio papel seja dono do schema e da tabela de auditoria, além dos demais guardas. Uma conta comum de leitura, mesmo autorizada a consultar outras tabelas, normalmente receberá `unverified` para esse histórico. Trata-se de um papel forte, embora o script imponha transação somente leitura; não é uma solução de acesso com privilégio mínimo e não se deve conceder escrita ou alterar RLS para fazê-lo funcionar. Se a política de acesso não permitir esse papel, a captura permanece bloqueada até existir um mecanismo de leitura dedicado que preserve a segurança e seja revisado.

Depois de confirmar a identidade do destino e obter a CA oficial por canal confiável, um operador pode usar um cliente `psql` interativo com TLS e sem senha em argumentos ou variáveis persistentes. Exemplo para uma sessão local com valores de destino já validados em variáveis locais e saída privada:

```sh
umask 077
env -i PATH="$PATH" LC_ALL=C PGSSLMODE=verify-full PGGSSENCMODE=disable \
  PGSSLROOTCERT="$COMPOR_CA_CERT" psql -X -qAt -W -v ON_ERROR_STOP=1 \
  -h "$COMPOR_DB_HOST" -p "$COMPOR_DB_PORT" -U "$COMPOR_DB_USER" -d "$COMPOR_DB_NAME" \
  -f supabase/tests/migration_histories_readonly.sql -o "$COMPOR_PRIVATE_OUTPUT"
```

`-W` solicita a senha ao operador, sem colocá-la no chat. Não desative verificação TLS, não use esse exemplo sem autorização e não acrescente `--debug`. A saída de captura contém duas linhas JSON, uma para cada `kind`; invalide todo o arquivo se `psql` falhar, houver mais ou menos de duas linhas ou faltar um dos dois tipos. Confira a procedência do arquivo. Em local privado, um operador monta o JSON abaixo, copiando `status`, `total_rows` e `entries` de cada linha sem omitir registros, removendo `kind` e adicionando os hashes de catálogo obtidos por procedimento revisado. `total_rows` inclui todas as linhas, inclusive malformadas; se a coleta omitir alguma, a análise rejeita o documento.

```json
{
  "format_version": 1,
  "legacy": {
    "status": "available",
    "total_rows": 1,
    "entries": [{"version":"20261103000000","filename":"20261103000000_projects.sql","source_commit":"0000000000000000000000000000000000000000","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]
  },
  "native": {"status":"absent","total_rows":0,"entries":[]},
  "catalog": {
    "reference": [{"key":"public/table/projects/rls","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}],
    "observed": [{"key":"public/table/projects/rls","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}]
  }
}
```

Os valores acima são apenas exemplos sintéticos. Os mapas devem conter itens únicos, identificados de maneira consistente, com SHA-256 de representações canônicas obtidas de forma equivalente; compare apenas capturas com compatibilidade de versão e canonicalização verificadas. Um conjunto vazio ou não uniforme é recusado. O relatório apenas indica que o conjunto enviado coincide ou diverge, sem reproduzir corpos ou conteúdo do catálogo.

```sh
python3 scripts/inspect_migration_evidence.py \
  --repo "$PWD" --commit SHA_COMPLETO_DO_COMMIT --evidence /caminho/privado/evidence.json
```

Use o commit realmente escolhido para implantação e um checkout completo com os commits de origem. Registros nativos contêm apenas versão neste formato: o campo `statements` do Supabase não é o SHA-256 dos bytes originais, e seu conteúdo não deve ser tratado como tal. Qualquer reconciliação de histórico, plano de baseline, aplicação ou alteração em produção exige revisão e autorização próprias depois da inspeção do banco efetivo.
