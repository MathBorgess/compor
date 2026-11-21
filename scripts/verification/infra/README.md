# Infraestrutura do verificador offline

Este diretório prepara PostgreSQL 17 e PostgREST reais para o spike da issue 51.
O banco recebe o baseline sintético de `baseline.sql` e as migrations do app,
sem reescrita. `migrations.json` fixa os nomes e bytes de cada migration; qualquer
divergência bloqueia o início até uma atualização revisada do manifesto.

## Preparação e execução

O Dockerfile recebe um snapshot de fontes sem `.env`, credenciais, `node_modules`
ou caches do host. O CLI em `../cli.mjs` prepara a imagem online, registra seu ID
imutável e exige que o digest do snapshot continue igual antes de executar.
Não monte outro candidato sobre a imagem preparada.

As imagens oficiais de Node e PostgreSQL são fixadas por digest OCI. O binário
estático de PostgREST e sua licença são fixados por SHA-256 em
`dependencies.json`; o build verifica tamanho, hash, conteúdo do tar e versão.
As versões de pacotes Debian ficam em
`/opt/compor-verification/debian-packages.txt`. As dependências npm vêm dos
lockfiles com `npm ci --ignore-scripts`. O `.npmrc` do web determina
`install-links=true`: as fontes reais dos pacotes locais precisam existir antes
do `npm ci` web para que seus conteúdos sejam empacotados corretamente.

O runtime exige Linux em container Docker, supervisor root e `--network none`.
O preflight recusa interfaces que não sejam loopback e exige que uma conexão
TCP ao endereço de documentação `203.0.113.1` falhe por ausência de rota.
Timeout ou outro erro não conta como prova de bloqueio. Não há instalação ou
download em `startInfra`.

```js
import { startInfra } from './scripts/verification/infra/stack.mjs';

const infra = await startInfra({ runDir: '/tmp/compor-run/infra' });
try {
  const evidence = JSON.parse(await infra.sql(
    "select json_build_object('projects', count(*)) from public.projects;"
  ));
  // O supervisor coleta essa evidência; ela não é uma API do produto.
} finally {
  await infra.close();
}
```

`startInfra` retorna `manifest`, `postgrestUrl`, `sql`, `close` e `postgresUrl`.
O último contém a senha sintética administrativa e pertence somente ao
supervisor: não deve ser serializado em relatórios nem fornecido ao app.
O argumento opcional `repoRoot` aponta para o snapshot. `jwtSecret`, `users` e
`openAiKey` aceitam apenas os parâmetros sintéticos delimitados pelo módulo;
o padrão é compartilhado com as fixtures externas. A chave de provedor precisa
ser exatamente `FIXTURE_OPENAI_KEY`.

Também existem entradas independentes, executadas dentro do container:

```sh
node scripts/verification/infra/preflight.mjs
node scripts/verification/infra/start.mjs /tmp/compor-run/infra
node scripts/verification/infra/stop.mjs /tmp/compor-run/infra
```

`start.mjs` escreve o manifesto JSON quando pronto e fecha seus serviços ao
receber SIGINT/SIGTERM. `stop.mjs` usa o registro de propriedade (PID, instante
de início do processo no kernel e executável) e nunca busca processos por nome.
O diretório de execução precisa ser novo e seus ancestrais precisam permitir
travessia ao usuário postgres. Estado, relatórios e logs permanecem para coleta;
o encerramento não apaga a base. O supervisor exterior controla o container,
Next, fixtures, evidências e o lifecycle de Colima.

| Serviço | Interface |
| --- | --- |
| PostgreSQL | `127.0.0.1:5432`, base `compor_verify` |
| PostgREST | `127.0.0.1:3001`, schemas `public,storage` |
| Readiness PostgREST | `127.0.0.1:3002/ready` |

`infra-preflight.json`, `infra-state.json`, `infra-manifest.json` e
`infra-stop.json` registram início, propriedade, versões e limpeza. PostgREST
escreve em `logs/postgrest.log`; PostgreSQL em `postgres/server.log`. O diretório
de PG pertence ao UID/GID 999; o app deve executar com outra identidade,
definida pelo supervisor exterior.

## Fronteira sintética e limites da evidência

`auth.users`, `auth.uid`, `auth.role`, metadados de Storage e a fonte da RPC fixa
de Vault são fixtures mínimas. `auth.uid` e `auth.role` usam
`request.jwt.claims`, preenchido pelo PostgREST depois de validar o JWT HS256.
As permissões e políticas de produto vêm das migrations reais. `service_role`
tem BYPASSRLS, mas não recebe privilégios diretos sobre tabelas do app ou Vault;
sua capacidade é a RPC fixa concedida pela migration 00028. Storage expõe
metadados via PostgREST com o JWT da pessoa e as políticas reais do app.

Isto não reproduz os serviços gerenciados de Supabase Auth/OAuth, Storage ou
criptografia de Vault. O gateway externo faz as respostas Auth e guarda os
bytes de imagens sintéticas; uma linha em `storage.objects` sozinha não prova
que bytes existem. PostgreSQL usa SCRAM em loopback; TLS termina no gateway
local de fixture (3443), fora deste módulo.

O teste `node --test scripts/verification/infra/infra.test.mjs` verifica rejeição
de migrations alteradas, rede inadequada e aplicação de todas as migrations
com oráculos de RLS/Vault em PGlite. Ele não prova o transporte PostgREST, o
runtime Linux ou concorrência do PostgreSQL nativo. Essas provas pertencem à
execução integrada offline. A camada offline não comprova navegador,
acessibilidade assistiva, Supabase gerenciado ou fornecedor real.

## Fontes de dependências

- [Docker Official Image PostgreSQL](https://github.com/docker-library/postgres)
- [Docker Official Image Node](https://github.com/nodejs/docker-node)
- [PostgREST v16.5](https://github.com/PostgREST/postgrest/releases/tag/v16.5)
- [Metadados oficiais dos assets PostgREST](https://api.github.com/repos/PostgREST/postgrest/releases/418019108)
- [Contrato npm ci e opções do lockfile](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

Os endereços exatos dos manifestos, assets e licença, junto com seus hashes,
estão em `dependencies.json`. O baseline SQL é código próprio de fixture, não
uma cópia das migrations internas dos serviços Supabase.
