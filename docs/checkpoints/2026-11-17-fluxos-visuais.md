# Checkpoint: exploração e referências visuais

Em 17/11/2026, Matheus pediu o congelamento do escopo para validar o que já foi integrado e preparar a entrega. Este registro toma como base o commit `99cd268d096e5557843da6e65a5633dd991d777b` de `codex/correcao-agentes-post`. Evidências de versões anteriores não são aprovação do commit final. Não houve deploy desta entrega até o registro deste checkpoint.

## O que está integrado

- O trabalho para exploração paralela inclui planejador, provas vinculadas ao contexto, intenção revogável, diário local, recuperação e reposição. A reposição compara a seleção atual com o manifesto antes de reivindicar a operação e usa os bytes congelados; a recuperação não deve reenviar automaticamente uma operação de resultado desconhecido.
- O suporte preparado para referências visuais inclui origem explícita, manifesto, snapshot local de bytes e contratos para vincular o subconjunto selecionado ao plano. Fontes legadas sem origem explícita continuam desconhecidas. A classificação de upload é uma declaração do aplicativo: identidade e bytes podem ser verificados pelo servidor, mas isso não comprova que o arquivo veio fisicamente do seletor do computador.
- Foram integrados a migration `20261117000037_reference_authority.sql`, comandos e recibos da autoridade de seleção, consentimento por sessão, coordenação local com CAS e uma adoção inicial sujeita a gesto explícito e revisão. O código de adaptação para reservas autorizadas está preparado. A composição completa dessa autoridade nos quatro fluxos pagos **ainda não está concluída**.
- O teste integrado offline de `481b9a3` exercitou planejador real, prova assinada e execução do lote com fornecedor simulado: três POSTs de edição, bytes e ordem verificados, e rejeição de adulterações. Não houve chamada paga; o teste não demonstra autorização real no servidor nem comportamento do fornecedor em produção.

Matheus aprovou uploads selecionados como obrigatórios e a eventual triagem, pelo agente, de referências externas ou geradas também selecionadas pela pessoa, mediante a autoridade e o consentimento aplicáveis. **Essa triagem visual ainda não está concluída nem ativada.** Não inferir autorização pelo manifesto ou por um booleano do navegador.

## Capacidade fechada

Manter `COMPOR_PARALLEL_EXPLORATION_ENABLED`, `COMPOR_SELECTED_LOCAL_VISUALS_ENABLED` e `COMPOR_REFERENCE_AUTHORITY_ENABLED` desligadas. Na consulta feita durante esta rodada à lista de variáveis do projeto Vercel correto, as três não constavam entre as 14 variáveis listadas. Revalidar os valores efetivos e o escopo do ambiente antes de qualquer deploy; a inspeção local das variáveis não comprova o estado de um deployment anterior.

As rotas e contratos preparados não devem ser tratados como autorização para ativação. Em particular, a verificação da seleção e da intenção precisa participar da mesma transação de reserva ou da mesma checagem sob lock, conforme aplicável. A chamada posterior ao fornecedor continua fora dessa transação: resultados incertos exigem reconciliação e não autorizam repetição automática.

## Evidências e impedimentos para entrega

| Verificação | Resultado observado | Limite da evidência |
| --- | --- | --- |
| Chromium | 625/625 passaram em captura iniciada após `53d10c7` e antes de `659d8a1`. | Não é o HEAD final. |
| `quality:test` | 98/98 passaram em integração anterior aos três testes adversariais adicionais. | Reexecutar no HEAD final e registrar o resultado. |
| Build | Passou após `b3e165f`. | Não comprova build do HEAD final. |
| Lint e typecheck | Passaram em integração intermediária. | Reexecutar para o commit final. |
| Performance | `d397a5b`: 328.513 bytes gzip para orçamento de 300.000. A medição offline de `93f3d7e` registrou 334.267 bytes. | O gate falhou na primeira medição; a segunda reproduziu a soma dos arquivos após build, não executou Lighthouse. Ver [auditoria](../quality/reference-authority-bundle-2026-11-17.md). |

O orçamento não foi alterado. A entrega depende de resolver o excedente sem enfraquecer contratos, executar os gates exigidos no commit final e verificar os checks remotos e o deployment correspondente. Nenhuma dessas evidências anteriores, isoladamente, comprova o comportamento autenticado em produção.

O `409` de produção relacionado à reserva `studio_turn` do chat está em **standby**, por decisão de Matheus; investigar se voltar a ocorrer. Ele não foi declarado resolvido. A reconciliação de uma imagem é outro fluxo e não deve ser apresentada como solução desse `409` sem evidência específica.

## Trabalho preservado fora da integração

Os caminhos abaixo são bancadas locais, não parte da entrega. Não apagar nem incorporar automaticamente alterações não commitadas; inspecionar o estado novamente ao retomar.

| Worktree | Estado observado no congelamento | Próximo trabalho, fora deste escopo |
| --- | --- | --- |
| `/Users/matheusborges/github/.worktrees/compor-autoridade-reservas-visuais` | Cinco arquivos modificados sem commit, sobre `d96e51d`: rota do planejador e adaptadores de planejador, lote, runtime e intenção. Implementação parcial; testes correspondentes ainda não estão verdes. | Concluir e revisar a propagação transacional de autoridade para planejador, lote/reposição, chat e arte; sem fallback visual quando a autoridade faltar. |
| `/Users/matheusborges/github/.worktrees/compor-selection-coordinator-ui` | Três arquivos de UI modificados sem commit, sobre `d94d6f3`. | Revisar integração da seleção e conflitos do coordenador antes de incorporar. |
| `/Users/matheusborges/github/.worktrees/compor-visual-dispatch-intent-race` | Alterações não commitadas no adapter/rota, teste de concorrência e migration `20261117000038_reference_selection_fence.sql` com teste novo. | Revisar a proposta de tombstone/fence para comando sem resposta; ela não está concluída nem incluída na entrega. |
| `/Users/matheusborges/github/.worktrees/compor-bancada-bundle-nov-17` | Bancada de medições; experimentos anteriores não foram promovidos. | Preservar enquanto as evidências forem úteis; a auditoria versionada contém os números relevantes. |

Uma resposta perdida de comando de seleção sem recibo permanece incerta. Até existir uma solução de fence revisada e testada, manter o bloqueio explícito: não substituir seleção remota, criar novo comando equivalente automaticamente ou presumir que ausência temporária prova que o comando não será aplicado.

## Entrega do recorte concluído

O [PR #60](https://github.com/MathBorgess/compor/pull/60) levou à `main` apenas o recorte de correções sequenciais, chat, Next 16.4.6 e imagens, sem as migrations ou capacidades visuais incompletas acima. O merge é `2aca180384df0daaff2798dff1573461d0d8cde2`; as mudanças de paralelismo e triagem permanecem nesta branch de checkpoint, baseada na `main` anterior, e precisarão ser reconciliadas com a nova `main` antes de uma próxima entrega. As bancadas não commitadas continuam preservadas.

No PR, o `Quality gate` do commit `6b41c92115ff944d1ce4926be68f14f8714a4c43` e todos os jobs aplicáveis passaram, inclusive navegador, isolamento e performance Linux de 298.569/300.000 bytes gzip. A suíte Chromium local anterior passou 526/526, e as correções posteriores de galeria e recibo de não envio tiveram respectivamente 15 e 26 cenários Chromium direcionados aprovados. Essas medições são de recortes/commits diferentes, conforme descrito no PR, e não provam o fluxo real autenticado.

A Vercel publicou o deployment `dpl_5rrN35TnsWi9ktzougmpMRRWeuHF` para o commit de merge, em estado `READY`, com `compor-ai.vercel.app` entre os aliases. O workflow da `main` concluiu o check `Apply migrations or initialize baseline` com sucesso; o recorte não contém novas migrations. Uma consulta pública à entrada respondeu HTTP 200. Não houve nova geração paga nem validação ponta a ponta autenticada desse deployment; o estado `READY` e o HTTP 200 não comprovam esses fluxos.

Próxima rodada: reconciliar esta branch com a `main` publicada, finalizar a composição da autoridade/snapshot e a UI com CAS, revisar o fence e os WIPs antes de incorporar, completar lotes paralelos e triagem de referências selecionadas, repetir os gates e medir o bundle sem alterar o orçamento. O `409` de produção continua em standby; só retomar a investigação se voltar a ocorrer, conforme pedido de Matheus.

## Retomada sobre a main publicada

A branch local `codex/compor-retomada-visual` integra o checkpoint sobre `2aca180`, a revisão da `main` confirmada no remoto. O código de produção avaliado está em `93d58ca49f3353beeca78663fad62e50dfb6e87a`. Os dois commits seguintes ampliam somente a fixture de revogação no navegador.

- O Agents API devolve três prompts com composições e contrastes distintos. O servidor reserva as três posições e inicia as chamadas ao GPT Image em paralelo. A interface mostra planejamento, espera e recibos por imagem. A contagem de 15 segundos começa após as três confirmações. Duas rodadas sem interação exigem outro pedido antes de gerar.
- O snapshot registra a seleção confirmada. Uploads selecionados entram obrigatoriamente. Referências externas consentidas e imagens geradas do projeto entram no GPT Image conforme a subsequência assinada pelo agente. O mesmo vínculo vale para a arte individual. O teste de lote verificou três chamadas multipart simultâneas, prompts distintos, bytes e ordem dos anexos, e exclusão do item descartado.
- Alterações entre abas usam CAS. A migration 38 encerra uma alteração pendente pelo ID antes de permitir uma nova seleção revisada. A 39 protege a retomada visual com o snapshot e a intenção sob a mesma trava. Consultas preservam os recibos, inclusive após retirada de consentimento. Falha parcial ou resultado incerto suspende novos pedidos automáticos.

| Gate local | Resultado |
| --- | --- |
| Lint, TypeScript, Next e Astro | Aprovados |
| Verificações estáticas e migrations | 109/109. Verificações Python específicas do CI também aprovadas |
| Contratos dos pacotes e scripts | 523 testes Node e 22 Python aprovados |
| Chromium | 676/676 em `93d58ca`, sem falhas, cancelamentos ou skips. Os três cenários direcionados da fixture ampliada também passaram em `4835887`. |
| Performance | **Reprovado**. 336.977 bytes gzip no JavaScript total para limite de 300.000 |

No macOS arm64 com Node 24.16.0, as cinco medições Lighthouse registraram 0 B de JavaScript externo na entrada sem sessão, LCP mediano de 620 ms, TBT de 0 ms e CLS de 0,008. O excedente de 36.977 B no total de chunks bloqueia a entrega. Os experimentos de agrupamento e eliminação de código estão na [auditoria de bundle](../quality/2026-11-17-bundle-retomada-visual.md). O orçamento segue o mesmo da `main`.

Os testes usaram fornecedores simulados, PGlite com migrations reais e PostgreSQL local com duas conexões independentes nos ensaios concorrentes de seleção e revogação. A revisão de produção depende do orçamento de bundle, de CI e de verificação autenticada com os serviços reais. Nesta rodada, as flags de produção não foram alteradas e o trabalho ficou local, sem chamadas pagas, migrations remotas ou deploy. O `409 project_busy` de produção segue em standby.

## Otimização do bundle para revisão

O build de `1e9774d` reduziu o JavaScript total de **336.977 para 334.949 bytes gzip** em relação a `9fb0367`. A economia de 2.028 bytes preservou o carregamento sob demanda do estúdio autenticado e da recuperação paralela. A codificação Base64 usa um caminho comum, assim como os digests SHA-256. A geração de arte lê o arquivo do snapshot já validado. O chat usa o compilador do mesmo parser Markdown com as opções de sanitização existentes.

A medição soma todos os arquivos JavaScript de `.next/static`, com Node 24.16.0, Next 16.4.6 e o orçamento original de **300.000 bytes**. Em cinco rodadas, a entrada sem sessão apresentou 0 B de JavaScript externo, LCP mediano de 622 ms, TBT de 0 ms e CLS de 0,008. O total continua bloqueando o gate de performance.

### Análise de dependências do cliente

Os snapshots Turbopack `bundle-pr-before-9fb0367` e `bundle-pr-after-1e9774d` cobrem as 49 rotas. A atribuição deduplica cada par de arquivo emitido e caminho do fonte. Dez saídas de cliente expõem seus módulos e duas saídas do runtime e do polyfill carecem dessa informação. Os bytes de ambas entram na medição.

| Fonte e consumidor | Atribuição gzip antes → depois | Evidência |
| --- | ---: | --- |
| `next/dynamic` no estúdio e na recuperação | 526 B → 0 B de `preload-chunks`; 422 B → 0 B do shim `async-local-storage` | `React.lazy` conserva as importações acionadas pela renderização e os fallbacks de `Suspense` |
| `markdown-to-jsx` no chat | 6.386 → 6.282 B | Compilador da mesma dependência, com bloqueio de HTML e regras de links preservados |
| Cliente de autoridade visual | 782 → 635 B; 279 B compartilhados no novo helper | IDs, seleção, digest e capacidade efêmera continuam no cliente por contrato. Assinatura e verificação de autoridade permanecem no servidor |

A inspeção não encontrou implementação de Server Action própria, SDK administrativo ou provedor de IA no cliente. Os módulos Next de roteamento e o shim removido são infraestrutura do framework. O polyfill `nomodule` continua presente (39.473 bytes gzip no arquivo). Ajustes experimentais de Turbopack renderam no máximo 403 bytes e foram descartados. Compartilhar schemas primitivos aumentou o bundle em 138 bytes e encadear verificações do Zod economizou apenas 8 bytes. Ambos os experimentos foram revertidos.
