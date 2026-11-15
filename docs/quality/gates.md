# Gates de qualidade

O workflow [Quality](../../.github/workflows/quality.yml) executa em cada pull request e por execução manual. Por decisão de Matheus em 10/11/2026, o push para `main` não repete os checks executados no PR. Num pull request, executa só as áreas que a mudança pode afetar; a execução manual executa tudo. O check agregado **Quality gate** passa quando o job estático termina com sucesso e cada outro job termina com sucesso ou foi pulado porque a área dele está desligada. Falha, cancelamento, job ausente ou job pulado com a área ligada bloqueiam o agregado. O [ADR 0032](../adr/0032-gates-por-area-e-falha-rapida.md) registra essa regra e sua atualização. O workflow não altera a proteção da branch. Essa proteção precisa exigir **Quality gate** para impedir merges sem os checks.

| Job | Área | Condição de aprovação | Escopo |
| --- | --- | --- | --- |
| Static checks | Sempre | ESLint sem erros ou avisos e testes de `scripts/quality` aprovados. Com a área `site` ligada, também `astro check` e build do site | TypeScript/TSX do app web, JavaScript dos pacotes, scripts de qualidade e site público com seus headers |
| Contracts and data isolation | `unit` | Todas as suítes dos pacotes e dos scripts Python aprovadas | Autorização, isolamento, idempotência, persistência, recuperação e contratos com fornecedores simulados |
| Web types and behavior | `web` | TypeScript estrito, Chromium instalado e toda a suíte web aprovada | Navegação, interação e estados do app com fixtures locais |
| Production performance | `web` | Build Next de produção e todos os limites abaixo aprovados | Entrada `/` sem sessão, servida sem JavaScript pelo proxy, com configuração pública sintética |

As instalações usam `npm ci --ignore-scripts` e lockfiles versionados. Os jobs não recebem secrets e não fazem deploy. O token tem `contents: read`. Só o Quality gate recebe também `actions: read`, para ler a duração dos jobs. As Actions usam SHAs fixos. Chromium vem da versão de Playwright fixada no lockfile web. `BROWSER_EXECUTABLE_PATH` aponta para esse executável, e o preflight falha se ele estiver ausente. Os testes de migração recebem o histórico Git completo e um cliente `psql`, sem banco externo.

O job de contratos executa explicitamente os testes offline do parser de migrations, do gerador de baseline e do workflow. Eles ficam em `scripts/tests/` e não são encontrados pelo `unittest discover` de `scripts`; o job usa um venv Python 3.12 e instala os wheels fixados por hash em `scripts/requirements-migration-tests.txt`. Isso não executa a migração nem valida o alvo de produção.

Os testes de sanitização do protótipo exigem `cwebp` e `dwebp` no `PATH`; o job instala e verifica ambos antes da suíte. O [pacote `webp` do Ubuntu 24.04](https://packages.ubuntu.com/noble/amd64/webp/filelist) fornece esses executáveis. Ausência dos codecs continua sendo falha, sem ignorar testes de pixels, transparência ou remoção de metadados.

Nos preparos de migração, `READ_COMMIT` identifica os bytes em um commit publicado; `SOURCE_COMMIT` e `SOURCES` preservam os IDs históricos registrados na auditoria. Os hashes e as guardas continuam obrigatórios. Uma regressão executa os preparos em um checkout sem os commits locais antigos e exige os mesmos oito arquivos SQL/proof, byte a byte. Os [hashes preservados e a falha que motivou a separação](migration-pins-2026-11-05.md) estão registrados.

No Ubuntu 24.04, o job de Lighthouse carrega um perfil AppArmor que permite `userns` somente ao caminho exato do Chromium instalado. Isso permite iniciar o sandbox do navegador baixado pelo Playwright, que não usa o caminho coberto pelo perfil do Chrome do sistema. O job mantém AppArmor ativo e não passa `--no-sandbox` ao Lighthouse. A configuração segue a [orientação do Chromium para perfis AppArmor](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md) e existe somente no runner temporário.

## Sinais externos da Vercel

Com a integração Git do [ADR 0043](../adr/0043-deploy-vercel-por-integracao-git.md), a Vercel acrescenta dois sinais que ficam fora do Quality gate.

- **Preview de cada PR.** O status da Vercel com o link do preview mostra se o build passa no ambiente dela: instalação sem `--ignore-scripts`, variáveis do projeto e versão de Node configurada. O `quality:build` não cobre essas diferenças. Para bloquear merges, a proteção da branch precisa exigir esse status, uma configuração do GitHub que cabe a Matheus.
- **Promoção da produção.** O contrato exige que o deployment da `main` espere o check `Apply migrations or initialize baseline`. A Vercel identifica o check pelo nome do job, e `scripts/tests/test_migration_workflow.py`, no job de contratos, exige esse nome. Renomear o job pede atualizar a Vercel e o ADR no mesmo PR. Em 15/11, a autoatribuição dos domínios de Production estava desligada e um deployment mostrou `No checks configured`; portanto o check listado no projeto não estava retendo a publicação. A [verificação e o pré-requisito da Vercel](../adr/0043-deploy-vercel-por-integracao-git.md#verificação-posterior-em-15112026) precisam ser resolvidos antes de declarar este gate eficaz.

Nenhum dos dois faz smoke do deployment publicado nem comprova login, geração ou dados reais.

## Execução por área

O primeiro passo do job estático, depois do checkout e do Node, executa `scripts/quality/changed-areas.mjs`. Num pull request, o script lista os arquivos com `git diff --name-only --no-renames` entre a base e o head do PR. Um arquivo movido conta no caminho antigo e no novo. As regras ficam na tabela `RULES` desse script, e a primeira que casar vale. Por exemplo, `apps/web/**` liga `web`, `packages/**` liga `web` e `unit`, e `apps/site/**` liga `site`. Markdown em `docs/` e na raiz não liga nada. Os outros arquivos de `docs/` ligam `unit`, porque um teste do protótipo lê JSON em `docs/evals`. `.github/**`, os `package*.json` da raiz, `eslint.config.mjs` e qualquer caminho sem regra ligam tudo.

Execução manual, diff desconhecido ou falha do git também ligam tudo. Um job dependente só é pulado quando a saída da área é exatamente `false`. Como os outros jobs dependem do estático, uma falha de lint também evita os jobs caros. Para conferir as áreas de um intervalo, execute `node scripts/quality/changed-areas.mjs BASE HEAD` na raiz.

As regras supõem que cada arquivo só afeta as áreas mapeadas. Quando um teste passar a ler arquivos de outra área, atualize `RULES` e seus testes no mesmo PR. Uma dependência fora do mapa pode passar no PR sem ser exercitada; a execução manual completa permite verificá-la. Um push direto na `main` não aciona Quality. O workflow separado de migrations mantém seus gatilhos.

## Falha rápida

Cada teste tem um limite padrão: 90 s na suíte web e 60 s nos pacotes, no protótipo e em `scripts/quality`. Um limite explícito no próprio teste continua valendo. Quando um teste estoura o limite, ele falha, os hooks `t.after` fecham navegador e servidores e a suíte segue para o próximo teste.

Um hook que espera `server.close` precisa fechar antes as conexões abertas com `server.closeAllConnections()`. Sem isso, uma conexão que o Chromium deixou aberta impede o fim do hook, o navegador nunca é fechado e a suíte fica parada até o limite do job.

O `timeout-minutes` de cada job fica perto da maior duração bem-sucedida observada desde 05/11, com folga para cache frio: estático 5, contratos 6, web 20, performance 6 e gate 2. Nenhum job passa de 20 minutos. Uma execução completa termina em até 27 minutos de relógio: 5 do estático, 20 do job mais longo e 2 do gate. Um teste travado falha pelo tempo limite do teste, muito antes do job.

## Minutos do GitHub Actions

O repositório é privado. O GitHub cobra cada job que executa, arredondado para cima até o minuto inteiro, e não cobra job pulado. A meta é de até 1.500 minutos cobrados por mês.

O último passo do Quality gate lê os jobs da própria execução pela API e escreve no resumo da execução a duração de cada job e uma estimativa dos minutos cobrados. Esse passo nunca reprova o gate. Para acompanhar a meta, some as estimativas das execuções do mês.

A estimativa não é a fatura, que continua sendo a fonte do valor cobrado. O gate ainda está em execução quando a estimativa é feita e conta como 1 minuto. Numa nova tentativa da mesma execução, os jobs reaproveitados aparecem com a duração original e aumentam a estimativa.

Estimativas anteriores à primeira execução paralela aprovada no CI. A coluna "Antes" vem das durações medianas desde 05/11, com a suíte web em série. A coluna "Com a suíte web paralela" foi estimada a partir de medições locais. O [registro da validação no CI](web-parallel-ci-2026-11-09.md) conserva as medições posteriores; a tabela abaixo não é faturamento:

| Execução | Jobs cobrados | Antes | Com a suíte web paralela |
| --- | --- | --- | --- |
| PR só com Markdown | Estático e gate | 2 | 2 |
| PR só em `apps/web` | Estático, web, performance e gate | Cerca de 19 | Cerca de 13 a 16 |
| Execução completa (manual; antes também push para `main`) | Todos | Cerca de 23 a 24 | Cerca de 17 a 21 |

A suíte web domina o custo. Na primeira execução paralela aprovada, 295/295 testes passaram em 475,66 s, e a janela dos logs do job web foi de 519,07 s. Na execução serial comparada, 287/287 testes levaram 872,14 s, com janela de 914,65 s para o job. São execuções e contagens diferentes; o [registro](web-parallel-ci-2026-11-09.md) explica o método, a falha inicial e a correção. A capacidade mensal depende também das áreas executadas e do arredondamento de cada job.

## Suíte web paralela

`npm run quality:browser` executa `apps/web/test/run.mjs`. O script usa a API `run()` do `node:test`, executa dois arquivos de teste por vez e mantém o limite de 90 s por teste. Cada arquivo continua num processo próprio, com servidores, navegador e dados próprios. Uma descoberta sem arquivos de teste falha; um teste reprovado também encerra a suíte com código diferente de zero.

O script começa pelos quatro arquivos mais lentos. Eles somam cerca de 60% do tempo da suíte e passam a maior parte desse tempo em esperas reais da interface. Os outros arquivos seguem em ordem alfabética. A lista dos mais lentos é mantida à mão. Uma lista desatualizada não quebra a suíte. Ela só deixa um arquivo lento terminar sozinho no fim.

Antes de iniciar os arquivos, o runner prepara duas árvores físicas privadas, como diretórios temporários irmãos do checkout. Se o diretório pai não for gravável, usa o diretório temporário do sistema. Fontes, configurações, `app`, `lib`, `test`, `public` e os pacotes são cópias com inodes próprios. Somente arquivos imutáveis das dependências instaladas usam hardlinks, com cópia como fallback entre filesystems. Os diretórios e links relativos das dependências pertencem a cada worker; um symlink que sair da árvore de origem reprova o preparo. Nenhuma configuração de produção muda para acomodar a cópia.

Cada arquivo executa por um wrapper nativo do `node:test`: reserva atomicamente qualquer um dos dois slots livres, muda o diretório para o `apps/web` privado e só então importa o teste copiado. Assim `import.meta.url`, caminhos relativos de pacotes, fixtures e o `.next` apontam para o mesmo worker. O slot é liberado no exit do processo, após seus hooks; tempos diferentes dos arquivos não provocam uma associação fixa incorreta. As cópias são preparadas antes do runner e removidas depois do encerramento dos filhos. Uma falha de preparo aguarda todas as cópias pendentes; um fluxo de testes interrompido preserva as fontes para não apagá-las enquanto um filho ainda possa usá-las.

O snapshot requer fontes estáveis e sem fixtures transitórias no checkout. Ele não copia `.next`, caches, `.git` ou `tsbuildinfo`. Os dois workers preservam seus próprios caches entre arquivos da mesma execução. O preparo autenticado abaixo e os limites dos testes continuam iguais. O [registro do isolamento](browser-worker-isolation-2026-11-10.md) separa a falha de CI que motivou essa mudança, os controles adversariais e a medição da suíte.

O preparo das fixtures autenticadas verifica a rota real com o mesmo cookie sintético do navegador, consome o HTML e os scripts e estilos locais em `/_next/static`. O HTTP 200 da entrada leve do ADR 0034 não comprova que o App Router está pronto. O prazo de startup continua em 30 s, com até 2 s por requisição, e também cobre o corpo e os chunks. Uma falha de asset espera a conclusão da mesma onda de requisições antes de tentar novamente. Os limites de 6 s das ações dessas fixtures e o padrão de 90 s por teste não mudam. O preparo não executa o JavaScript nem consulta serviços externos.

Medição local de 09/11, num Apple M1 Max com outra tarefa usando a máquina ao mesmo tempo:

| Suíte | Execuções | Duração | Testes aprovados |
| --- | --- | --- | --- |
| Em série | 3 | Mediana 474 s (467 a 501 s) | 267 de 267 em duas; 266 de 267 em uma |
| Paralela | 5 | Mediana 238 s (238 a 241 s) | 267 de 267 em quatro; 266 de 267 em uma |

As duas formas usaram de 505 a 515 s de CPU. O ganho vem de sobrepor as esperas, não de fazer menos trabalho. A suíte paralela usou em média cerca de 2,1 núcleos, contra 1,1 em série, e até cerca de 3 GB de memória somada nos processos da suíte.

A primeira validação paralela aprovada no CI está no [registro de 09/11](web-parallel-ci-2026-11-09.md): Quality gate verde, 295/295 testes, sem pulos e sem aumento dos limites. A redução observada da janela do job foi de 43,25% em relação à execução serial 44; não é uma comparação causal controlada.

Limites conhecidos:

- O runner privado do GitHub tem 2 vCPUs, segundo a documentação do GitHub; sua capacidade não foi medida neste registro. Os trechos que exigem CPU dos dois arquivos competem entre si. A primeira execução aprovada levou cerca de 7 min 56 s na suíte e 8 min 39 s na janela dos logs do job; isso não substitui a estimativa de minutos cobrados nem a fatura.
- Isolar somente os diretórios de saída não isolava `app/`: o CI 52 expôs leitura parcial de manifest e evento HMR de outra fixture. As árvores privadas substituem essa configuração; a medição histórica acima antecede essa correção.
- As portas continuam escolhidas com `listen(0)` e liberadas antes de o `next dev` usá-las. Com dois arquivos ao mesmo tempo, a chance de colisão aumenta, mas continua pequena.
- Iniciar um único `next dev` para toda a suíte foi avaliado e não foi feito. Com cache quente, cada início leva cerca de 1,2 s até a primeira resposta, e a suíte faz cerca de 45 inícios. Os arquivos usam ambientes diferentes: Supabase simulado por teste, certificados próprios e flags diferentes. Compartilhar o servidor exigiria reescrever o preparo de cerca de 28 arquivos e dividir estado de servidor entre eles.
- A medição da posição do compositor ("the composer stays at the conversation bottom") foi corrigida em `d25de70`: o teste espera o fim da animação de reabertura da conversa antes de medir o layout. A falha histórica ocorreu tanto em série quanto em paralelo; não é uma pendência desta suíte.
- Numa execução paralela anterior à ordem atual, o teste do orçamento de referências em `studio-storage.test.mjs` estourou o limite de 90 s. A causa não se repetiu em 55 execuções desse arquivo, sozinho ou ao lado de outro arquivo pesado. O hook corrigido faz um novo estouro falhar em 90 s, em vez de parar a suíte.

## Correção e manutenção

O TypeScript verifica o app Next com `strict: true` e sem ignorar erros no build. Componentes usam TSX; rotas e lógica usam TS. `quality:typecheck` bloqueia erros de contrato antes dos testes do navegador. O ESLint bloqueia `any` explícito, supressões TypeScript e arquivos JavaScript de produção em `apps/web/app` e `apps/web/lib`. Testes e ferramentas podem continuar em MJS.

Dados de HTTP, storage e ferramentas passam por schemas em runtime. Declarações `.d.ts` descrevem os pacotes compartilhados ainda escritos em JavaScript; elas verificam seus consumidores TypeScript, mas não substituem os testes das implementações desses pacotes. O estúdio usa importação dinâmica após a sessão para reduzir o código carregado na entrada.

O ESLint aplica as regras recomendadas de correção, incluindo nomes inexistentes, propriedades duplicadas e expressões ambíguas entre linhas. Variáveis e imports sem uso bloqueiam arquivos TypeScript, TSX, JavaScript e MJS. Argumentos e erros capturados podem ficar sem uso. A verificação de uso está desativada em JSX porque o parser básico não reconhece imports usados somente nas tags JSX. Não há mudanças de formatação obrigatórias.

`no-empty` permite blocos `catch` vazios usados nas rotas de recuperação existentes. `no-control-regex` está desativada porque os validadores existentes examinam caracteres de controle. Essas exceções são explícitas em [eslint.config.mjs](../../eslint.config.mjs).

`quality:maintenance` gera um relatório de complexidade ciclomática por função, com arquivo e linha. Valores acima de 20 são candidatos para revisão. Não bloqueiam o PR e não autorizam uma extração mecânica. A [calibração inicial](baseline-2026-11-05.md) registra os maiores valores. Os contratos determinísticos continuam sendo o gate de comportamento durante refatorações.

As dependências de qualidade ficam no pacote privado da raiz. Não entram no bundle da aplicação. O override de `minimatch` fixa a versão corrigida `11.0.4` para a árvore do ESLint 10, devido ao [advisory GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Orçamento de performance

Os valores usados pelo gate estão em [budgets.json](../../scripts/quality/budgets.json).

| Medida | Limite inclusivo | O que é contado |
| --- | --- | --- |
| JavaScript inicial | 250.000 bytes gzip | Soma dos scripts externos únicos presentes no HTML de `/`; zero na entrada sem sessão |
| JavaScript de todos os chunks | 300.000 bytes gzip | Soma de todos os arquivos `.js` em `.next/static` |
| Largest Contentful Paint | 2.500 ms | Mediana de cinco navegações mobile simuladas |
| Total Blocking Time | 200 ms | Mediana das mesmas cinco navegações |
| Cumulative Layout Shift | 0,1 | Mediana das mesmas cinco navegações |

Os tamanhos usam gzip de cada arquivo, sem headers HTTP. Não equivalem aos bytes transferidos por uma CDN com Brotli. O limite total inclui chunks de outras rotas e os carregados sob demanda. Ele impede que mover código para um import dinâmico esconda crescimento ilimitado do cliente.

O script inicia um servidor de produção em uma porta local disponível e um perfil temporário do Chromium. Lighthouse usa emulação mobile, throttling simulado e reset de armazenamento. Cada relatório guarda a configuração efetiva, versão e avisos. A coleta registra a resposta HTTP da página e recusa redirecionamento para outra rota, erro do Lighthouse, erro no console ou métrica ausente. Não aceita uma página de erro como uma página rápida. O HTML auditado precisa ter o `main.compor-entry` e o formulário que posta em `/auth/sign-in`. Ele pode não ter script externo, como a entrada sem sessão do [ADR 0034](../adr/0034-entrada-leve-sem-runtime.md), mas todo script presente precisa ser um chunk local em `/_next/static`.

Os limites de LCP e CLS usam os valores de referência publicados pelo Google. O limite de TBT usa a faixa mobile do Lighthouse. A mediana de laboratório não substitui o percentil 75 observado em usuários reais. [LCP](https://web.dev/articles/lcp), [CLS](https://web.dev/articles/cls), [TBT](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time).

Os relatórios incluem acessibilidade e boas práticas para diagnóstico, sem impor uma nota agregada. Os artefatos `production-performance` e `maintainability` ficam disponíveis por cinco dias. Localmente, ficam em `quality-results/`, fora do Git. O job web também guarda `studio-screenshots` por cinco dias: são capturas desktop/mobile com dados sintéticos, para revisão visual, sem comparação automática com o Figma.

## Limites da cobertura

O benchmark não autentica no Google, não consulta um projeto Supabase e não chama o GPT Image. Ele não mede latência de rede real, geração de imagem, interação autenticada, INP de campo ou acessibilidade completa. O App Router que uma pessoa conectada carrega fica fora do Lighthouse e do limite de JavaScript inicial; só o limite total cobre esse código. Os contratos usam fornecedores simulados para verificar chamadas, autorização e recuperação sem custos externos.

A escolha entre SSR e conteúdo estático depende dos dados da rota. Sem cookie de sessão, `proxy.ts` responde `/` com HTML sem JavaScript. Com sessão, o Next renderiza `/` sob demanda. O Astro gera o site público estaticamente. O gate valida o build e o resultado observado, sem exigir que dados de sessão sejam convertidos em conteúdo estático.

O orçamento torna visível o custo de novas dependências. Componentes pesados opcionais podem usar [lazy loading do Next](https://nextjs.org/docs/app/guides/lazy-loading). Imagens públicas podem usar [`next/image`](https://nextjs.org/docs/app/api-reference/components/image) quando o formato e a entrega permitirem. As imagens privadas geradas têm regras próprias de acesso e integridade. O workflow não reescreve esses fluxos automaticamente.

## Comandos locais

| Comando na raiz | Pré-requisito | Saída |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Node 24 | Ferramentas de qualidade fixadas no lockfile |
| `npm run quality:lint` | Instalação da raiz | Erros de correção e imports sem uso |
| `npm run quality:typecheck` | Instalação web | Checagem TypeScript estrita do app Next |
| `npm run quality:test` | Node 24 e Git | Testes do avaliador de orçamento, das áreas, do gate e da estimativa de minutos |
| `node scripts/quality/changed-areas.mjs BASE HEAD` | Git com os dois commits | Áreas que um PR entre esses commits ligaria |
| `npm run quality:maintenance` | Instalação da raiz | `quality-results/maintainability/complexity.json` |
| `npm run quality:unit` | Instalação dos pacotes `private-images`, `remote-mcp`, `agile-deliberation`, `agents-api` e do protótipo, Python 3, `psql`, `cwebp`/`dwebp` no `PATH` e histórico Git completo | Resultados dos testes de pacotes e migrações |
| `npm run quality:browser` | Instalação web, `remote-mcp` e `agile-deliberation`, `BROWSER_EXECUTABLE_PATH` definido | Suíte web completa |
| `npm run quality:build` | Instalação web | Build Next de produção |
| `npm run quality:performance` | Build de produção, instalação da raiz e browser definido | Bundle, cinco relatórios HTML e JSON, resumo e log do servidor |
| `(cd apps/web && npx --no-install next analyze --output --snapshot NOME)` | Instalação web | Snapshot do grafo de módulos do Turbopack em `apps/web/.next/diagnostics/analyze` |
| `(cd apps/web && npx --no-install next analyze export --snapshot NOME) \| gzip > DESTINO.jsonl.gz` | Snapshot salvo; `set -o pipefail` e destino fora do repositório | Grafo em JSON Lines para comparar antes e depois, conforme o [ADR 0033](../adr/0033-turbopack-e-analise-do-bundle.md) |

No CI, o navegador é instalado com `npx --no-install playwright-core install --no-shell chromium`, executado em `apps/web`. O diretório `~/.cache/ms-playwright` fica em cache pela versão do `playwright-core` no lockfile web. A imagem ubuntu-24.04 já tem as bibliotecas do Chromium. Lá, `--with-deps` só instalava fontes pelo apt e às vezes travava de 7 a 13 minutos. Numa máquina Linux nova, use `--with-deps`, como no [guia da arquitetura](../architecture.md#instalação-e-verificação). O caminho vem de `chromium.executablePath()` do pacote instalado.
