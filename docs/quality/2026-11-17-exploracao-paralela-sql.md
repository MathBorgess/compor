# Evidência local — SQL da exploração paralela

Data: 17/11/2026. Base: `8e6e61a`. Branch: `codex/sql-exploracao-paralela`.

## Escopo e fronteiras

A migration `20261117000033_exploration_parallel_batches.sql` foi exercitada em PGlite e PostgreSQL 17.12 locais, com usuários, projetos, objetos Storage e dados sintéticos. Auth e Storage são fixtures declaradas. O gate da infraestrutura também aplica a sequência completa das 33 migrations sobre sua baseline sintética, preservando o verificador de hashes.

Não houve chamada OpenAI, chave real, Supabase remoto, push, deploy ou mudança em dados reais. Nenhuma medição local demonstra qualidade dos prompts, paralelismo efetivo no provedor, custo faturado ou latência de produção. A camada de cliente permanece uma integração separada.

## Resultados

- Controle negativo: os quatro primeiros cenários executados sem a migration nova falharam pela ausência da RPC de planejamento.
- `node --test scripts/quality/exploration-parallel.test.mjs`: **8/8** passaram.
- Suítes direcionadas de rejeição, review gate e catálogo: **3/3** passaram com os seis primeiros cenários novos (**9/9** no comando combinado).
- `npm run quality:test`: **68/68** passaram após acrescentar a nova migration e seu hash ao inventário; baseline e demais hashes não foram alterados.
- `npm run quality:lint`: passou.
- `COMPOR_PARALLEL_PG_CONTAINER=compor-parallel-sql-20261117 node supabase/tests/exploration_parallel_concurrency.mjs`: passou no PostgreSQL **17.12**, em conexões independentes.

O primeiro gate amplo detectou o inventário desatualizado; o check foi preservado e o manifesto recebeu somente a migration nova. Um erro de fixture de sinal sem ID e um reset de role após rollback foram corrigidos antes do resultado final. A prova concorrente pode rodar repetidamente em um contêiner local vazio/descartável; cria e remove seu próprio banco.

## Casos cobertos

Reserva atômica e rollback por ID duplicado; três provas independentes; replay sem nova prova; isolamento de contas e recusa de anônimo; post inexistente/de outro projeto; desconhecido bloqueante; conclusão tardia com prova; consumo único; estados fora de ordem; revisão monotônica; 15 segundos após o terceiro sucesso; duas rodadas contadas por lote; interação em sucesso precoce; fragmento serial histórico; prioridade foreground; substituição explícita de recusa com novo ID; preservação dos sucessos; fechamento de parcial por exclusão; migração e rollback preservando recibo histórico.

A prova PostgreSQL abre uma transação que mantém o lock por conta, inicia outra conexão e observa `wait_event='advisory'` antes de liberar a primeira. Verifica planner contra planner, exclusão durante planejamento, replay do mesmo lote, outro lote concorrente, três conclusões simultâneas e reserva após exclusão. O cooldown é avançado somente nos dados sintéticos do teste; não há espera de 15 segundos nem alteração do intervalo de produção.

## Recursos e limitações

Foi usado um contêiner próprio sem rede e sem portas, com limite de memória de 256 MiB e dados em tmpfs, na Colima já ativa (2 CPUs/2 GiB). Contêineres anteriores foram preservados. A tarefa não iniciou a VM e não assume sua responsabilidade de desligamento.

A revogação atômica da intenção de geração após pausa/saída é uma alteração posterior identificada na revisão; este commit ainda depende da autorização/contexto verificados pelo backend e não fornece uma capacidade de intenção revogável. Não habilitar o caminho paralelo enquanto essa fronteira e a integração dos endpoints não estiverem verificadas.

## Complemento da revogação (migration34)

A lacuna de revogação descrita acima motivou a segunda migration, sem alterar a33 já entregue. `scripts/quality/exploration-intent.test.mjs` acrescenta quatro cenários: tombstone antes de criação/CAS antigo; criação vencedora com resposta perdida; pausa entre planejamento e despacho/reutilização explícita do plano; capacidade específica de reposição e exclusão de intenção ociosa. Também recusa revogação atrasada que atingiria outra intenção ativa, preserva GET após pausa e impede usar as assinaturas antigas sem intenção.

O gate completo passou **72/72** antes das últimas recusas conservadoras de escopo do revoke; depois delas foram repetidos os testes de intenção e a aplicação integral das migrations. A prova PostgreSQL foi ampliada com cinco disputas sob owner lock: revoke antes de create, create antes de revoke, revoke antigo contra intenção nova, revoke antes de reservar imagens e reserva de imagens antes de revoke. As três imagens da reserva vencedora continuam `running`, sem cancelamento fictício.

O inventário recebeu o hash da migration34 e conta34 migrations, preservando os hashes anteriores. Não houve chamada paga nem aplicação remota. Timeout de revogação sem GET confirmado continua uma limitação explícita, não um sucesso de pausa.

## Epoch original da revogação (migration35)

A migration35 preserva `revocation_epoch` nullable no tombstone e devolve `revocationEpoch` separado do epoch atual da conta. Não preenche tombstones históricos. O [ADR 0063](../adr/0063-epoch-original-da-revogacao.md) registra o contrato e a compatibilidade dos adapters.

- Red: os cinco testes novos falharam contra a forma anterior das RPCs, sem `revocationEpoch` (`/tmp/compor-revocation-epoch-red.log`).
- Green dirigido: **12/12**, incluindo os cinco testes novos, os quatro contratos históricos de intenção e os três testes do inventário/infra (`/tmp/compor-revocation-epoch-green.log`).
- `npm run quality:test`: **79/79**, aplicando as **35 migrations** com seus hashes e baseline preservados (`/tmp/compor-revocation-epoch-quality.log`).
- `npm run quality:lint`: passou (`/tmp/compor-revocation-epoch-lint.log`).
- `COMPOR_PARALLEL_PG_CONTAINER=compor-parallel-sql-epoch35-20261117 node supabase/tests/exploration_parallel_concurrency.mjs`: passou no PostgreSQL **17.12**, em conexões independentes e com barreiras observadas no advisory lock (`/tmp/compor-revocation-epoch-postgres.log`). Inclui revogações duplicadas, replay concorrente com nova intenção, CAS antigo após outra revogação, criação/revogação nas duas ordens e tombstone legado desconhecido; preserva também os ensaios anteriores de lote e exclusão.

O primeiro ensaio concorrente encontrou um erro no parser do teste, que tentou interpretar o marcador da barreira como JSON. O parser passou a selecionar a linha de resultado; o ensaio inteiro foi repetido e aprovado. Não houve alteração de SQL motivada por esse erro.

Ambiente: macOS/arm64, Node **24.16.0**, PostgreSQL em container próprio sem rede nem porta publicada, memória limitada a 256 MiB, sobre Colima já ativo (2 CPUs/2 GiB). Auth/Storage continuam sintéticos; não se executou Supabase remoto, fornecedor pago nem integração de navegador neste complemento. A evidência comprova o comportamento local transacional, não cancelamento de uma chamada externa. Os adapters e a UI são verificados separadamente no head integrado.

## Retomada paralela protegida (migration36)

O [ADR 0064](../adr/0064-retomada-paralela-vinculada-a-intencao.md) registra a nova RPC com capacidade ativa, CAS e recibo por intenção. O contrato serial/MCP permanece intacto.

- Red: os seis testes novos falharam antes da implementação das novas RPCs (`/tmp/compor-parallel-review-red.log`).
- Green: **6/6 regressões** (`/tmp/compor-parallel-review-green.log`), cobrindo revogação antes/depois da retomada, negação de admissão posterior, provas/escopos/CAS, isolamento, replay sem liberar outro ciclo, `not_paused`, planner ativo/desconhecido, rollback e exclusão lógica.
- `npm run quality:test`: **85/85**, incluindo aplicação das **36 migrations** e verificação dos hashes anteriores (`/tmp/compor-parallel-review-quality.log`).
- `npm run quality:lint`: passou (`/tmp/compor-parallel-review-lint.log`).
- `COMPOR_PARALLEL_PG_CONTAINER=compor-parallel-sql-review36-20261117 node supabase/tests/exploration_parallel_concurrency.mjs`: passou no PostgreSQL **17.12** com conexões independentes (`/tmp/compor-parallel-review-postgres.log`). As barreiras confirmam espera na trava da conta nas duas ordens de retomada/revogação e na duplicação de retomada. O recibo permanece recuperável, a admissão pela intenção revogada é recusada e replay não limpa um gate posterior. Os ensaios anteriores também passaram.

O container deste complemento foi isolado, sem rede/portas, limitado a 256 MiB e identificado exclusivamente para a tarefa; o Colima já existente foi preservado. Auth/Storage continuam sintéticos. Não foi executada integração remota, chamada paga, navegador ou deploy neste complemento; endpoint e cliente são verificados no head integrado. O caminho legado permanece capaz de retomar seu gate mediante seu contrato histórico, e não foi apresentado como protegido pela nova capacidade.

Resultado final do complemento: **7/7** nos quatro cenários de intenção mais três verificações de infraestrutura, cinco disputas adicionais PostgreSQL aprovadas e lint aprovado. A execução ampla anterior permaneceu em **72/72**; após as duas recusas conservadoras foram repetidas as fronteiras afetadas, sem repetir verificações não afetadas.
