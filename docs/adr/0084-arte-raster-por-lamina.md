# ADR 0084 — Arte raster por lâmina no carrossel

## Decisão

O plano tipado separa texto, layout e raster. A pessoa anexa um PNG ou JPEG ao slot de mídia de uma lâmina no estúdio. Receitas com diagrama e a lâmina de fechamento usam seus próprios slots. A alteração invalida a composição da revisão. Para alterar a quantidade de lâminas, a pessoa revê o plano na conversa. Reordenar preserva o vínculo da arte com a lâmina. A ação de compor envia ao servidor somente os originais associados ao plano atual. A ação de salvar vincula os JPEGs compostos à versão.

O IndexedDB mantém o original por conta, projeto, peça, lâmina e digest. A mesma imagem pode ser reutilizada nas revisões do post nesse navegador. O plano e a versão persistem o `artSha256`. As projeções que alimentam a conversa omitem a fonte. Na reabertura em outro navegador, os JPEGs finais vêm do armazenamento privado. Para recompor ali com a mesma arte, a pessoa reanexa o original.

## Contrato

A rota autenticada mantém JSON de até 32 KiB para planos sem raster. A entrada multipart contém `request` com o mesmo envelope e um arquivo `art:<slideId>` para cada `artSha256`. O corpo fica limitado a 4 MiB. Com o proprietário conferido, o servidor compara os hashes e o renderer decodifica e normaliza o raster antes da composição. O navegador do renderer segue isolado da rede. O manifesto inclui os hashes da fonte e do PNG normalizado. O estúdio volta a conferir a sessão antes de enviar cada upload e antes de adotar uma composição.

A migration `20261123000049` inclui o digest da fonte no cálculo do plano canônico. Um recibo de outra combinação de copy, layout e fonte não pode ser salvo como a nova composição. O bucket de JPEGs mantém a política e o caminho por versão. A arte raster manual pertence ao gesto da pessoa. A automação de direção de arte e o parecer do juiz da bancada têm autorizações e evidências próprias.

## Verificação

Verificar troca de arquivo durante uma revisão, vínculo entre o SHA e o recibo, recusa de MIME incompatível, isolamento entre contas, reabertura sem cache e ZIP com os bytes dos JPEGs salvos. A cobertura criativa, a colisão com rostos e o Chromium empacotado em Linux exigem execuções próprias.

O canário da rota passou no Next com Chromium local. PGlite confirmou a preservação de versões anteriores e a recusa de recibos com o digest de outra fonte. O teste de estúdio usou render e Storage simulados. Ele descartou respostas antigas após edição ou logout e recuperou o ZIP em um contexto sem cache.

O primeiro build passou de 300.000 bytes gzip. Agrupar a recuperação de propostas no chunk autenticado do estúdio eliminou um chunk separado. A condição de montagem da recuperação permaneceu a mesma. O build local final mediu 298.495 bytes gzip, com LCP mediano de 622 ms em cinco execuções Lighthouse na entrada pública.
