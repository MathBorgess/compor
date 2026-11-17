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
