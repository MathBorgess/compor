# Supabase isolado — registro da validação transacional

**Fonte: relato de Matheus, 3 de novembro de 2026.** Matheus informou que a execução do script no projeto isolado `compor-marco0-test` terminou com `ROLLBACK` após conexão TLS verificada. O agente não capturou a saída completa, não observou a execução e não verificou independentemente o estado remoto. O relato, por si só, não permite confirmar o resultado de cada asserção ou uma aplicação persistente das migrações.

O artefato [isolated_rollback.sql](../../supabase/tests/isolated_rollback.sql) é uma cópia do script preparado para a execução relatada. Ele contém snapshots das três migrações e asserções para duas identidades sintéticas sob o papel `authenticated` e claims JWT: isolamento de projetos e versões, gravação e conflito de versão esperada, histórico, isolamento de tentativas e repetição **sequencial** de chave de idempotência. Há guardas para `auth.users` e tabelas em `public` vazios e para triggers não internos em `auth.users`; uma recusa é um resultado possível, não uma prova de falha do produto.

Na inclusão deste registro, os hashes SHA-256 dos snapshots no script foram comparados com os arquivos de migração na branch e correspondiam exatamente:

| Artefato | SHA-256 |
| --- | --- |
| Script | `cab8af479a5271e2cb48fb9a881c79fe37d6633e159eef6ea0e9ea9cdeeafcb5` |
| `20261103000000_projects.sql` | `ad26b2f1f207e2b826c11522f8903ee5d2e7f280637fab3d7c05c987eb117b09` |
| `20261103000001_piece_versions.sql` | `be5327b6e63b438b749c6b4c56abd38fe55f699a52f5203fa4420ce92b692528` |
| `20261103000002_agent_attempts.sql` | `04817a32f79f0099d1f9395c1fed71c47245a980a8a106a5ad35aa6f3e227145` |

O desenho não testa concorrência entre conexões, Storage, OAuth, Codex, rede da aplicação ou jornada E2E. O resultado de um banco isolado não demonstra implantação, aplicação durável ou proteção em outro ambiente. A propriedade de isolamento do projeto e a verificação TLS foram informadas por Matheus, não verificadas pelo agente nesta anotação.

## Reprodução controlada

Execute somente com autorização em um banco Supabase **novo, vazio e isolado**, após conferir o destino, permissões e hashes. O script inclui `BEGIN`, `ON_ERROR_STOP` e `ROLLBACK`; em erro, execute-o em um processo `psql` independente que encerre a conexão para que a transação aberta seja revertida. Não execute parcialmente nem em interfaces que ignorem diretivas `psql`. Inspecione também eventuais efeitos externos de extensões ou triggers; transações SQL não revertem efeitos externos arbitrários.

Configure previamente um serviço local libpq chamado `compor-isolado`, apontando para o destino correto. Obtenha a cadeia de CA confiável por canal seguro e use `sslmode=verify-full`, que verifica a CA e o hostname; não desative verificação TLS. Com o serviço e a CA já configurados, uma execução interativa é:

```sh
psql -X -W -v ON_ERROR_STOP=1 --file supabase/tests/isolated_rollback.sql 'service=compor-isolado sslmode=verify-full sslrootcert=/caminho/para/ca.pem'
```

Substitua somente o caminho da CA e o nome do serviço pelos valores locais apropriados. Digite a senha apenas no prompt protegido do terminal ou use um gerenciador de credenciais apropriado; nunca a inclua no comando, no repositório ou no chat. Registre a saída sanitizada e o destino verificado para futuras provas, e confirme separadamente que a conexão terminou e que a transação foi revertida. Este documento não autoriza uma nova execução, deploy ou alteração de dados.
