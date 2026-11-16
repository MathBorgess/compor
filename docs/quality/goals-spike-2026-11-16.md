# Verificação por Goals: evidência local do spike

16/11/2026. Registro da implementação autorizada em Q10 do [ADR 0057](../adr/0057-verificacao-por-goals-em-tres-camadas.md). Os três cenários offline passaram em uma execução e em seu replay; cinco controles negativos impediram aprovação. Isso demonstra a fatia descrita abaixo, sem comprovar a experiência completa no navegador ou nos serviços gerenciados.

**Estado deste registro:** ensaio local concluído no snapshot abaixo. A rodada final repetiu positiva, replay e controles negativos depois da correção do encerramento exploratório. O protocolo externo encerrou sem erros e preservou o resultado inconclusivo correspondente à cobertura parcial; os gates locais existentes também passaram. CI e adoção de um novo gate obrigatório continuam decisões separadas.

## Revisão e ambiente observados

O comando operacional está no [guia do spike](../../scripts/verification/README.md); o desenho alvo permanece no [documento de arquitetura](../design/2026-11-16-issue-51-goals-arquitetura.md). As evidências são locais, em `quality-results/verification/`, e não estão incorporadas a este documento. Para revisão em outro host, é necessário transportar o pacote correspondente, não apenas esta tabela.

| Âncora comum às regressões abaixo | Valor |
| --- | --- |
| Commit-base do app | `d2b97904623da015b1ae6ac71b26eceb9ebbcde8` |
| Snapshot incluindo alterações locais | `980b2eb371850bce8a08dc60117c1900cc8f9e62005fef14673695897efd66a3` |
| Suíte fixada | `a154dae2c35079bbd1619319d58116af82c261d3902e8b92c9b8e6b7af9957c4` |
| Imagem imutável | `sha256:2e1d472b4b77122322a680da20eb87c2b8305e606d39364a0d53246de40542f2` |
| Baseline SQL sintética | `2e26c17cc9d8fb1e07577e3824dfa9515b8e1020400901b03e6d372cdea2e083` |

O supervisor executou Linux/ARM64 em Colima no Mac, com a VM configurada em 2 CPUs/2 GiB. O CLI limita o container a 2 CPUs, 1.750 MiB e 512 processos. O preflight registrou Node 24.22.3, Next 16.4.4, PostgreSQL 17.12, PostgREST 16.5 e OpenSSL 3.0.22. Imagens e binários fixados, licença e limitações do baseline estão no [contrato de infraestrutura](../../scripts/verification/infra/README.md).

Nos três runs da tabela seguinte, `infra-preflight.json` passou e inventariou as **32 migrations reais, com hashes, sem reescrever seu SQL**. O teste de egress recebeu `ENETUNREACH` para `203.0.113.1:443`; o container usou `--network none`. A tentativa HTTPS sem a CA sintética foi rejeitada. `infra-stop.json` registrou PostgreSQL e PostgREST parados; `summary.json` registrou limpeza concluída, sem falhas.

Isso comprova esses controles no namespace local observado. Não é prova de isolamento contra quem controla Docker ou o host, nem de TLS/segurança da infraestrutura gerenciada. Durante a sessão apareceram containers `supabase_*compor-exploracao-local` de outra tarefa; eles foram preservados. A VM compartilhada também deve ser preservada enquanto não houver exclusividade para encerrá-la.

## Regressões e oráculos

| Execução | ID | Resultado observado |
| --- | --- | --- |
| Positiva | `c24005c2-06c1-4be0-b4f7-7c8a1133dd98` | G01, G02 e G03 atendidos |
| Replay do mesmo snapshot | `8a6de9a0-07fc-461e-95d3-320030287204` | G01, G02 e G03 atendidos; `parentRunId` aponta para a positiva |
| Persistência omitida deliberadamente | `64686b03-3b8c-48f8-b78b-b80f8f8e126c` | G01 violado; reprovação esperada |

A positiva e o replay contêm **12 critérios e 66 checks atendidos**, conferidos nos relatórios por critério. A revisão independente da tarefa também conferiu esses relatórios. O replay conserva imagem, snapshot e suíte, mas gera novas identidades efêmeras; não exige igualdade byte a byte de todo o pacote.

A correção do harness alterou o digest da suíte, com a baseline anterior preservada. Os três `goalDigest` permaneceram iguais aos da rodada intermediária: G01 `5ad8dbbb7959de706d1efaed5e31c94ba3985b674600954b5a138617556cd234`, G02 `08e21a9be432eb1e6ef91c244759bf62f67607b52668e3b13dba6077037ad1e2` e G03 `db41fcda59ce2836690d2f86f063b952276b8580c7405ab182df0684628413a8`. Portanto, os critérios não foram relaxados para aprovar a rodada final.

| Goal | Critérios/checks | Evidência que sustenta o resultado offline |
| --- | --- | --- |
| G01 — jornada e retomada | 6/31 | HTTP real para criar/abrir/recarregar, ledger sem geração anterior à intenção, preparação/confirmação/cancelamento, escopo de referências, SQL da versão, bytes autenticados, estado reaberto, fatos e helpers temporais |
| G02 — isolamento e disputa | 3/12 | Recusa de acesso cruzado, SQL antes/depois, disputa pela mesma reserva por requisições reais, um despacho e bytes privados do proprietário |
| G03 — confirmação perdida | 3/23 | Falha após persistência com recuperação; falha após despacho sem resultado persistido mantém `unknown`; ledger e SQL verificam ausência de novo despacho |

O avaliador usa os dados retornados pelo HTTP, consultas SQL próprias, arquivos e ledger. Uma mensagem de sucesso do driver não basta. A credencial SQL de observação pertence ao supervisor, não ao adaptador do produto. Os tokens e custos de modelo estão explicitamente `null`; regressões não iniciam um modelo externo.

Os IDs `initialState.projectId/postId` dos Goals são exemplos do contrato e **não são os IDs efetivamente usados pelo driver atual**. As identidades concretas aparecem em `observations.identity` e nos registros HTTP/SQL. Isso limita a alegação de reprodução: reproduz-se o comportamento no snapshot, não exatamente aqueles IDs declarados como estado inicial.

## Controles que fizeram a avaliação reprovar

O recibo dos quatro controles de integridade está em `c24005c2-06c1-4be0-b4f7-7c8a1133dd98/G01/negative-controls-7aRP5i/receipt.json`. As cópias têm `evaluationPassed:false`; o `passed:true` do recibo significa que os defeitos foram detectados. A evidência original foi preservada.

| Perturbação | Resultado e diagnóstico |
| --- | --- |
| Imagem declarada removida | Inconclusivo; arquivo ausente |
| Bytes da imagem alterados | Inconclusivo; hash divergente |
| Snapshot do manifesto alterado | Inconclusivo; divergência da âncora externa |
| Manifesto removido | Inconclusivo; proveniência indisponível |
| Gravação da versão omitida na execução real | Violado em `G01.version-reopened`; consulta independente retornou `versions: []` |

No quinto controle, a fixture devolveu um recibo sintético sem persistir a versão. O fluxo subsequente recebeu `store-image_http_404`; os critérios posteriores sem evidência ficaram inconclusivos. A falha comprovada de persistência permaneceu violada. Esse ensaio demonstra que o avaliador não aceita o recibo como substituto da linha SQL, sem afirmar que toda possível regressão de persistência está coberta.

## Medições locais

As durações vêm de `summary.json`/`manifest.json`. Bytes são a soma dos tamanhos dos arquivos regulares preservados, lidos em 16/11/2026; não são tamanho alocado em disco ou tamanho de imagem Docker. O tempo total começa dentro do supervisor e inclui startup/encerramento; não inclui o lançamento do comando no host ou preparação online.

| Medida | Positiva | Replay | Negativa de persistência |
| --- | ---: | ---: | ---: |
| Startup do conjunto | 3.677 ms | 3.438 ms | 3.199 ms |
| G01 | 1.797 ms | 1.580 ms | 1.522 ms |
| G02 | 358 ms | 273 ms | não executado |
| G03 | 324 ms | 286 ms | não executado |
| Total do supervisor | 6.681 ms | 5.985 ms | 5.194 ms |
| Pico `memory.peak` do cgroup | 670.523.392 bytes | 700.563.456 bytes | 677.830.656 bytes |
| CPU acumulada `usage_usec` | 7.405.930 µs | 6.970.242 µs | 5.918.296 µs |
| Artefatos declarados nos manifestos | 21.562 bytes | 21.562 bytes | 7.492 bytes |
| Pacote preservado, sem cópias negativas | 170.667 bytes / 25 arquivos | 170.713 bytes / 25 arquivos | 134.039 bytes / 16 arquivos |

O pacote positivo com as cópias negativas soma 252.209 bytes/41 arquivos. A preparação que produziu esta imagem levou 23.322 ms (`prepare-final.log`), reaproveitando camadas: **não é medição de instalação fria**. A primeira preparação encontrou a ausência do `.npmrc` no contexto anterior ao `npm ci`; a correção passou a copiar a configuração e as fontes necessárias ao empacotamento dos pacotes locais, sem alterar lockfiles.

| Consumo registrado por Goal, igual na positiva e no replay | Ações | Requisições | Limites configurados |
| --- | ---: | ---: | --- |
| G01 | 16 | 81 | 80 ações, 240 requisições, 180 s |
| G02 | 8 | 40 | 80 ações, 240 requisições, 180 s |
| G03 | 9 | 51 | 80 ações, 240 requisições, 180 s |

Cada execução usou um ciclo, uma candidata e um condutor. O total foi 33 ações/172 requisições por suíte positiva. As duas amostras não estabelecem distribuição de latência, capacidade sob carga ou orçamento de CI. O pico do cgroup não mede a RAM de toda a VM/Mac; outros containers tornaram o ambiente contendido. Não houve benchmark de stress nem comparação controlada de economia com um agente em navegador. Custo de provedor real e custo do cliente de agente não foram medidos.

## Exploração externa e diagnóstico preservado

O ensaio final `c9b0adfd-ed68-4b68-baeb-02a0ffcad49f/external-agent-demo.json` registra 16 respostas do protocolo: inspeção, projeto, preparar/nomear/confirmar post, revisão antiga recusada com 409, pedido de imagem, edição, salvar/listar/abrir versão, reabrir estado, criar/pollear turno, inspeção e `close`. O controle de revisão antiga preservou o conteúdo do post. Isso é evidência parcial de AX: ações e revisão podem ser descobertas e dirigidas por um cliente externo.

Nesse run, `observations.errors` é `[]`, `summary.cleanup` é `completed` sem falhas e `infra-stop.json` registra ambos os serviços parados. Foram contabilizadas 11 ações e 86 requisições, com 4.188 ms de exploração e 7.915 ms totais do supervisor. O pacote preservado soma 187.494 bytes/18 arquivos. O resultado de G01 continua **inconclusivo** porque a exploração não produziu todas as observações exigidas: o resumo agregado registra `status: failed`, com `failure: false` no cenário. Essa distinção demonstra encerramento operacional correto sem inventar cobertura ou afirmar que o Goal foi atendido.

O histórico foi preservado. `54beffee-f3f1-403f-8b34-f0aed48a5992` terminou depois de criar projeto porque o probe esperava 200 e a rota corretamente devolveu 201; ficou inconclusivo, com limpeza concluída. `82283b08-0d4e-49fc-b639-5e4b60f7d22f` respondeu ao protocolo, mas falhou no encerramento de um post sem fatos (`facts` indefinido), sem recibo final de limpeza; a rodada final acima reproduziu a correção. O primeiro diagnóstico integrado, `671fea33-bd56-41ef-9cec-8901bc4e51f4`, teve G01 inconclusivo por evidência incompleta do driver, enquanto G02/G03 passaram.

A rodada intermediária positiva `69f326f7-e239-49bf-b6e7-a4f19391fa6b`, seu replay `03345080-26e9-4279-b326-1aa453ae1490` e a negativa `8c532db8-d7d1-4ab6-878f-61656dbc998e` permanecem como evidência histórica, com suíte `8392e79f7a953069684bc9fa44ba735dd41e27152549223184474951fe076f3b` e snapshot `9764e57569a1a0a55b4b526147806a37179e5d452cd8f62b50bca0fd2e3638e9`. Os totais intermediários de 7.382/7.049 ms e picos de 772.788.224/691.085.312 bytes não são as medições finais da tabela principal. Nenhum resultado posterior apaga uma falha anterior.

## Cobertura e lacunas

| Fronteira | O que foi observado | O que permanece sem prova nesta rodada |
| --- | --- | --- |
| Banco e HTTP | Next, PostgreSQL e PostgREST reais, JWT/papel e migrations do app | Supabase gerenciado, CI Linux/amd64 e produção |
| Auth, Storage, Vault e fornecedores | Fixtures declaradas; metadados sob RLS e bytes sintéticos conferidos | Login/OAuth real, criptografia de Vault, serviço Storage completo e fornecedor pago |
| Estado local | Adaptador em arquivo fecha/reabre estado | IndexedDB, quota, eventos entre abas e lifecycle real do navegador |
| Tempo | Helpers reais com relógio virtual em 4.999/5.000 e 14.999/15.000 ms, cancelamento e restante após retorno | Todas as condições de elegibilidade/foco/saída da interface e observação visual das esperas |
| UX/A11y | Contratos compartilhados e gate Chromium existente aprovado localmente | Auditoria visual/assistiva e paridade completa de todos os Goals pelo adaptador de navegador |
| Imagens | Geração sintética, armazenamento e bytes de imagem 1×1 | Edição de imagem, qualidade criativa, disponibilidade/preço/latência do fornecedor |
| AX exploratória | Protocolo estruturado, controle de revisão e encerramento demonstrados | Observações completas de G01, upload exploratório próprio e replay de trajetória |

Os checks locais das áreas afetadas foram concluídos. Os logs operacionais ficam em `~/.codex/infra/compor-goals-20261116/`; as contagens abaixo foram conferidas neles. As correções posteriores aos checks de produto ficaram no harness; a rodada final repetiu seus testes e lint. Nenhuma linha desta tabela é evidência de execução no CI.

| Check | Evidência local |
| --- | --- |
| `quality:lint` | Sem erros em `lint-final.log` |
| `quality:test` | 59/59, sem falhas ou skips, em `quality-test-3.log` |
| Driver compartilhado | 2/2 em `shared-driver.log` |
| `quality:unit` | 473 testes Node e 22 Python aprovados em `unit.log` |
| `quality:typecheck` | Concluído sem erros em `typecheck-2.log` |
| `quality:browser` | 484/484, zero skips, 413.194,73 ms em `browser-3.log` |
| `quality:build` | Build Next concluído em `build-2.log` |
| Site | Check sem erros/avisos e build aprovado em `site-check.log`/`site-build.log` |
| `quality:performance` | Cinco medições e avaliador aprovados em `performance-2.log` |

O gate Chromium completo sucedeu a correção do `fetch` e as reproduções menores que a diagnosticaram. Lighthouse continua medindo a entrada sem sessão; seu resultado não mede custo/latência de geração ou qualidade visual do estúdio autenticado.

## Adoção proposta

Manter inicialmente a regressão Docker como comando local/manual opcional para mudanças nas fronteiras cobertas. Conservar os gates existentes e os testes rápidos já integrados; não ativar um novo job obrigatório de Docker/CI com base em duas medições locais. A frequência, os recursos e a retenção de artefatos do novo job exigem decisão do proprietário após reprodução no runner de CI e revisão das lacunas.

O ensaio local está concluído dentro da cobertura declarada. Restam a decisão de adoção pelo proprietário, a reprodução no runner de CI antes de qualquer gate obrigatório e a evolução das lacunas de navegador/serviços reais. Mudanças de expectativa continuam revisão separada do proprietário. Estes registros não autorizam push, PR, merge, deploy ou migrations remotas.

As inspirações foram incorporadas como método: ciclo preparar→conduzir→capturar→limpar do [pstack verification](https://github.com/cursor/plugins/blob/bf0c7cd80abdbf7fe47b634978a7d1b4071f71a7/pstack/skills/create-verification-skill/SKILL.md), conclusão verificável por worker e reexecução independente; o [exemplo de verificação de Lauren Tan/Poteto](https://github.com/poteto/verification-skill-example/blob/d5abe70d0d8c671672b6cef4069363f26c488feb/README.md) orientou a separação de contrato, jornadas e evidências. A [descoberta](../design/2026-11-16-issue-51-goals-descoberta.md) registra revisões, limites e atribuição. Não se importou um runtime multiagente nem se demonstrou ganho quantitativo por usar múltiplos modelos.
