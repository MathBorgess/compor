# ADR 0077 — Imagem canônica da versão salva

Em 19/11/2026, a revisão do SCRUM-15 mostrou que **Salvar** gravava o texto da versão e copiava o PNG só no IndexedDB. Outro navegador via a versão sem a arte. A imagem gerada podia existir no Storage sob a versão de origem da reserva, sem um registro de qual arquivo era a imagem da versão salva. **Imagem-base** gravava na mesma chave local que o card da versão lia, então a arte de uma versão já salva mudava no navegador.

## Decisão

Cada versão salva tem no máximo uma imagem canônica. A tabela `piece_version_images` guarda `(project_id, piece_id, version) → asset_id`. Não há escrita direta para a pessoa autenticada: a função `bind_piece_version_image` confere dono, versão e objeto privado já existente, insere uma vez e, se o vínculo já existe, devolve o mesmo `asset_id` ou um conflito sem alterá-lo. O caminho do objeto continua `{conta}/{projeto}/{peça}/{versão}/{asset}.png`, sem update nem delete no bucket.

No salvamento manual, o navegador envia o PNG da imagem atual para um `assetId` derivado da versão. Repetir encontra o objeto já gravado (`409 asset_exists`) e confirma o mesmo vínculo. Uma resposta perdida não adota a versão no navegador; a tentativa seguinte reconcilia o texto já salvo e publica a mesma imagem. A preparação de uma geração não copia a arte anterior para a versão nova: a imagem gerada, quando chega, é o primeiro vínculo daquela versão.

No IndexedDB, a imagem `base` de uma versão salva (`baseVersion >= 1`) não é substituída. **Imagem-base** grava só o rascunho (`preview`, ou `base` enquanto a peça ainda está na v0). O quadro mostra o rascunho quando ele existe e, sem cópia local, o PNG do vínculo.

## O que permanece

A listagem de outros arquivos da versão, a imutabilidade do Storage e a separação entre exportar e salvar continuam. Esta decisão não altera RLS existente nem políticas do bucket. A migration `20261119000045_piece_version_image.sql` fica no repositório e só deve ser aplicada com o ok do Matheus. Duas abas que disputam o estado local continuam no contrato anterior de revisão do IndexedDB; isso não faz parte deste vínculo.

## Prova

O teste de navegador salva num contexto, altera a imagem-base e abre o mesmo post noutro contexto com IndexedDB vazio. O segundo mostra a imagem salva, sem recuperação manual, e a imagem-base nova não substitui a versão. O contrato de publicação e a função SQL mostram que repetir não duplica nem troca o `asset_id`.
