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
