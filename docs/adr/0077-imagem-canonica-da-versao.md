# ADR 0077 — Imagem canônica da versão salva

Em 19/11/2026, a revisão do SCRUM-15 mostrou que **Salvar** gravava o texto da versão e copiava o PNG só no IndexedDB. Outro navegador via a versão sem a arte. A imagem gerada podia existir no Storage sob a versão de origem da reserva, sem um registro de qual arquivo era a imagem da versão salva. **Imagem-base** gravava na mesma chave local que o card da versão lia, então a arte de uma versão já salva mudava no navegador.

## Decisão

Cada versão salva tem no máximo uma imagem canônica. A tabela `piece_version_images` guarda `(project_id, piece_id, version) → asset_id`. Não há escrita direta para a pessoa autenticada: a função `bind_piece_version_image` confere dono, versão e objeto privado já existente, insere uma vez e, se o vínculo já existe, devolve o mesmo `asset_id` ou um conflito sem alterá-lo. O caminho do objeto continua `{conta}/{projeto}/{peça}/{versão}/{asset}.png`, sem update nem delete no bucket.

No salvamento manual, o navegador envia o PNG da imagem atual para um `assetId` derivado da versão. Repetir encontra o objeto já gravado (`409 asset_exists`) e confirma o mesmo vínculo. Uma resposta perdida não adota a versão no navegador; a tentativa seguinte reconcilia o texto já salvo e publica a mesma imagem. A preparação de uma geração não copia a arte anterior para a versão nova: a imagem gerada, quando chega, é o primeiro vínculo daquela versão.

Se o objeto já existe ou outra imagem foi vinculada, o estúdio lê os bytes que ficaram no Storage antes de atualizar o cache. Com imagens privadas desativadas, o estúdio salva a imagem apenas neste navegador. Com o envio ativo, o estúdio valida as dimensões, de até 2048 pixels por lado, e o tamanho do PNG, de até 4 MiB, antes de gravar a versão.

No IndexedDB, a imagem `base` de uma versão salva (`baseVersion >= 1`) não é substituída. **Imagem-base** grava só o rascunho (`preview`, ou `base` enquanto a peça ainda está na v0). O quadro mostra o rascunho quando ele existe e, sem cópia local, o PNG do vínculo.

## O que permanece

A listagem de outros arquivos da versão, a imutabilidade do Storage e a separação entre exportar e salvar continuam. Esta decisão não altera RLS existente nem políticas do bucket. A migration `20261119000046_piece_version_image.sql` fica no repositório e só deve ser aplicada com o ok do Matheus. Duas abas que disputam o estado local continuam no contrato anterior de revisão do IndexedDB; isso não faz parte deste vínculo.

## Prova

O teste de navegador salva num contexto, altera a imagem-base e abre o mesmo post noutro contexto com IndexedDB vazio. O segundo mostra a imagem salva, sem recuperação manual, e a imagem-base nova não substitui a versão. O contrato de publicação e a função SQL mostram que repetir não duplica nem troca o `asset_id`.

## Adendo (23/11/2026) — Confirmação passiva e recuperação avançada recolhida em `StudioAssets`

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, item 2), em conjunto com o adendo do [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) e como decorrência direta do vínculo canônico automático de `piece_version_images` definido neste registro:

### O que muda

- Na interface de *Materiais e versões* (`StudioAssets`), quando o vínculo canônico `piece_version_images` está ativo, o fluxo manual redundante (`"Salvar PNG final no projeto"` e sua caixa de autorização) é aposentado como interface primária.
- Em seu lugar, o estúdio exibe a confirmação passiva de que a arte está vinculada ao salvamento do post (`"Arte da versão {v} salva automaticamente com este post."`).
- A listagem manual de arquivos da versão e a recuperação de envios sem vínculo ou versões legadas (`AssetRecovery`) passam a ficar recolhidas em `<details>Recuperação avançada de arquivos</details>`, preservando o comportamento autônomo anterior de `StudioAssets` quando o vínculo canônico não está ativo.

### O que permanece inalterado

- A imutabilidade do Storage (`{conta}/{projeto}/{peça}/{versão}/{asset}.png`, sem `update` nem `delete`), as políticas RLS e do bucket, a idempotência da RPC `bind_piece_version_image` (`409 asset_exists` / conflito sem substituição), a validação de dimensões (até `2048` px por lado) e tamanho (`4 MiB`), e a separação entre `base` e `preview` no IndexedDB para `baseVersion >= 1`.
- O fallback local quando imagens privadas estão desativadas, a recuperação de versões legadas ou sem vínculo, a separação entre exportar e salvar e os contratos multi-lâmina dos [ADRs 0081](0081-imagens-do-carrossel-na-versao-salva.md) e [0083](0083-composicao-e-versoes-de-carrossel.md).

### Verificação

- Verificar em testes de navegador que `StudioAssets` com vínculo canônico ativo exibe o status passivo e recolhe `AssetRecovery` em `<details>Recuperação avançada de arquivos</details>`, mantendo compatibilidade do modo autônomo e recuperação de versões legadas (implementação da UI em curso na etapa correspondente).
