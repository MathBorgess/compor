# Verificação por Goals — spike local

O perfil `offline` executa controlador compartilhado, HTTP Next, PostgreSQL e PostgREST reais em um contêiner sem rede externa. Auth, Vault, Storage e provedores são fixtures declaradas. Não executa login real, geração paga nem navegador. Veja o [desenho](../../docs/design/2026-11-16-issue-51-goals-arquitetura.md) e a [infraestrutura](infra/README.md).

## Preparar e reproduzir

Requer Node 22.13.1+, Git e Docker Linux disponível. No Mac, usar Colima manualmente com 2 CPUs/2 GiB e seguir o procedimento de registro/encerramento do proprietário; a CLI nunca inicia ou encerra a VM. `COMPOR_DOCKER_CONTEXT` escolhe contexto explicitamente (padrão `colima` no Mac, `default` no Linux).

Após revisar os Goals, avaliador e fixtures, fixe **uma vez** a suíte inicial:

```sh
node scripts/verification/cli.mjs freeze-suite
npm run verify:prepare
npm run verify:doctor
npm run verify:goal -- all
```

`freeze-suite` cria um arquivo fora do checkout, somente leitura, em `~/.local/state/compor-verification/`; recusa sobrescrita. `COMPOR_VERIFICATION_TRUST` permite indicar outro arquivo. `prepare` e `run` recusam uma suíte diferente da fixada. Alterar expectativas/avaliadores exige revisão separada do proprietário e uma nova baseline; preparar a imagem nunca promove a alteração automaticamente. Essa separação detecta deriva, mas não protege contra quem controla o host e pode editar ambas as fontes de confiança.

A preparação usa rede para baixar dependências fixadas. Execução e replay usam a imagem por digest, ambiente permitido explicitamente, fontes capturadas sem `.env`, sem diretório pessoal/socket Docker e `--network none`. O preflight verifica versões, todas as migrations, rede e TLS. Next roda com usuário diferente do supervisor/banco. Fontes symlink ou que saem da árvore são recusadas. Exclusões de arquivos são capturadas.

```sh
node scripts/verification/cli.mjs list-goals
node scripts/verification/cli.mjs show-goal G01
node scripts/verification/cli.mjs inspect RUN_ID
node scripts/verification/cli.mjs evaluate RUN_ID
node scripts/verification/cli.mjs replay RUN_ID
node scripts/verification/cli.mjs negative-controls RUN_ID
node scripts/verification/cli.mjs run G01 --negative-persistence
```

`RUN_ID` é o UUID impresso pela CLI. Evidências ficam em `quality-results/verification/RUN_ID`. `evaluate` exige a suíte confiável correspondente e todos os cenários selecionados na âncora. `replay` executa novamente o snapshot imutável de uma regressão e liga a nova execução à anterior; IDs efêmeros mudam. Não reexecuta automaticamente trajetórias exploratórias. `negative-controls` exige um G01 aprovado e verifica quatro cópias defeituosas sem alterar a fonte. `--negative-persistence` devolve um recibo sintético de salvamento sem escrever a versão: **o resultado esperado desse comando é reprovação**, com SQL independente mostrando a ausência da versão.

## Conectar um agente existente

```sh
node scripts/verification/cli.mjs open G01
node scripts/verification/cli.mjs inspect RUN_ID
node scripts/verification/cli.mjs act RUN_ID '{"action":"create-project","args":{"title":"Ensaio sintético"},"requestId":"33333333-3333-4333-8333-333333333333","expectedRevision":0}'
node scripts/verification/cli.mjs close RUN_ID
```

O cliente descobre objetivos em `list-goals`, lê o contrato e seu digest em `show-goal`, descobre ações/revisão por `inspect` e escolhe comandos. A comunicação usa `docker exec` e um socket Unix privado no contêiner; não publica porta nem cria serviço de modelos. Mutações exigem UUID de requisição e revisão esperada. Reentrega idêntica devolve recibo; conteúdo diferente com mesmo UUID falha. Nenhum erro autoriza repetição automática. O agente externo usa seu próprio cliente/modelo.

O conjunto atual permite projeto, preparar/nomear/confirmar/cancelar post, editar conteúdo, salvar/listar/abrir versões, reabrir estado, solicitar/pollear turno e pedir imagem. O upload remoto dos bytes da versão está exercitado pelo G01, ainda sem comando exploratório próprio. Não há scheduler genérico `wait`, edição de imagem ou replay de trajetória. Um explorador que não produziu todas as observações obrigatórias termina **inconclusivo**, mesmo se algumas ações funcionaram.

Limites iniciais por Goal: 80 ações, 240 requisições, 180 s reais, uma candidata e um condutor; sem loop automático de correção. Controle e HTTP consomem o orçamento. Inspeção também é limitada. O watchdog interrompe novas chamadas, aborta requisições pendentes e preserva evidências; um `timeout` externo encerra o contêiner se o supervisor travar. `close` não promete desfazer efeito já enviado. Nova execução não é continuação silenciosa da anterior.

Tokens/custo do agente externo são `null` (desconhecidos); o ledger sintético do provedor não mede consumo real. Quem exige teto financeiro precisa de cliente que o imponha. O harness não inicia nenhum modelo para regressões.

## Evidência e limites

Cada Goal registra manifesto, observações, hashes dos arquivos e relatório por critério. A âncora fixa commit-base, hash da árvore incluindo alterações locais, suíte, imagem, seleção e modo. SQL independente, recibos HTTP, bytes autenticados e ledger têm papéis diferentes. O app não recebe o oráculo SQL do verificador.

G01 cobre criação explícita, fatos/referências, versão/bytes e retomada; G02 cobre acesso cruzado e disputa; G03 cobre confirmação perdida após persistência e após despacho ao provedor. O relógio virtual exercita os helpers reais de 5 s e 15 s; condições completas de UI continuam no gate Chromium existente. Persistência local do driver é arquivo, não IndexedDB. Imagem 1×1 e resposta textual fixa não demonstram qualidade criativa.

Testes rápidos do avaliador/infra entram em `quality:test`; o replay Docker **não é novo gate obrigatório**. O teste do driver que importa TS usa dependências web:

```sh
node --import ./apps/web/node_modules/tsx/dist/loader.mjs --test scripts/verification/scenarios/shared-driver.test.mjs
```

Medições, cobertura e proposta de adoção serão registradas em `docs/quality/`, sem confundir execução local Linux/ARM via Colima com CI Linux/amd64 ou produção.
