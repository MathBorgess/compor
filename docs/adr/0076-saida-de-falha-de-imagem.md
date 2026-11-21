# ADR 0076 — Saída quando a imagem não chega

Implementado localmente em 21/11/2026 para o [SCRUM-36](https://compor-mathai.atlassian.net/browse/SCRUM-36). Substitui, para erro HTTP do provedor e para execução morta, a trava indefinida descrita no [ADR 0025](0025-prova-de-desfecho-da-exploracao.md) e preservada nos [ADRs 0069](0069-retomada-de-imagem-com-versao-fixa.md) e [0070](0070-encerramento-de-exploracao-serial-incerta.md). Não altera a retenção `quality_held` do [ADR 0075](0075-revisao-de-candidatas-a-imagem.md).

## Classificação

O adaptador de imagens deixa de tratar todo status diferente de 401/403 como resultado desconhecido.

| Resposta do provedor | Motivo exposto | Classificação | Efeito na conta |
| --- | --- | --- | --- |
| 400 e outros 4xx, exceto 401, 403, 408 e 429 | `provider_rejected_400` | falha | encerra na hora; nova geração exige nova reserva |
| 429 | `provider_rejected_429` | retentável | encerra na hora; não há retry automático |
| 5xx | `result_unknown` | retentável | encerra na hora, porque a resposta HTTP chegou sem imagem |
| timeout, rede ou corpo inválido | `result_unknown` | incerto | permanece `unknown` até o prazo ou o encerramento explícito |
| processo morto com `running` | `result_unknown` | incerto | depois do lease deixa de contar como espera |

401 e 403 continuam recusa de credencial. A revisão que retém uma imagem já gerada continua `quality_held`.

## Prazo e encerramento

Cada execução nova recebe lease de 8 minutos, acima do `maxDuration` de 300 segundos da rota. O texto da tela continua dizendo “até 2 minutos”, que é o prazo visível da geração, não o lease de crash. Ao vencer, a linha deixa de responder `waiting_image` e passa a resultado incerto. `close_unconfirmed_image_work` encerra `unknown` e `running` fora do lease como `failed` / `result_unknown` / `unconfirmed`. Não insere reserva e não chama o provedor. Uma execução `failed` não pode ser concluída nem reutilizada: outra imagem exige outra reserva. “Tentar de novo” e “Encerrar e tentar de novo” são gestos explícitos e fazem essa reserva nova.

A migration `20261119000045_image_attempt_closure.sql` não muda políticas de RLS. As funções novas recebem `execute` para `authenticated` no mesmo padrão das RPCs de imagem já existentes. Aplicar no banco remoto depende de autorização do Matheus e deve ocorrer sem geração em andamento, porque uma linha `running` antiga sem lease fica encerrável.

## Tela

O contrato do comentário 10195 do Chief of Design distingue três estados no post: geração dentro do prazo, recusa 400 ou 429, e resultado incerto. Só a ação principal usa o amarelo. Em outro projeto, a espera diz o nome do projeto de origem e oferece “Abrir”. A mensagem de imagem retida pela revisão não muda.
