# Investigação de referências de cerâmica para Marina

Observação em 2026-10-29, para a persona fictícia Marina. Pesquisa pública de leitura, sem chave de API, alteração do catálogo ou ativação de fonte. Os hashes são SHA-256 dos bytes recebidos e identificam esta amostra mutável; não são assinaturas da origem nem garantias de qualidade.

O catálogo `prototypes/compor-mcp/src/catalog/sources_catalog.json`, versão 1.2.0, relaciona boards e consultas permitidos e requer consentimento explícito. Não há board cujo slug indique cerâmica, pottery ou craft. Cinco boards existentes foram consultados pelo RSS: a contagem abaixo procura apenas `ceramic|potter|clay|mug|ceram|cup|handbuilt|hand.build`, sem distinguir palavras completas, no título e na descrição textual. Não inspeciona as imagens nem prova ausência de referências relevantes no restante dos boards; legendas vazias, outros idiomas e palavras ambíguas afetam a contagem.

| Board existente | Itens no RSS | Menções encontradas | SHA-256 do RSS |
| --- | ---: | ---: | --- |
| `behance/photography` | 26 | 0 | `8c14d94342d33b1088f16754bf06d198d1800a8af1b730f10a50050bb80f1982` |
| `adobe/art-photography` | 24 | 0 | `4fbc68575ee93a4bcc830684bfcba50cae9004cf4ae6dbce4c7e74e19029be21` |
| `behance/illustration` | 26 | 0 | `efb6c0713d7299f323eee21b530b5671669d2ed686698687b980c22c1fed5925` |
| `weandthecolor/illustration` | 25 | 0 | `6082062ffc71141a73d26818539bceb7dd87146b8401478d0f7ab32ea26c36d2` |
| `kittldesign/product-photoshoots` | 7 | 0 | `86c0fa46b23ba1056baf2c7efa5c7dd428a614abeec70bd827cb92bfbdf865a0` |

O RSS de `compor-curated/still-life-texture-composition` retornou HTTP 404 nesta consulta; SHA-256 do corpo da resposta: `5189e31d848d693d025191789349e5a400415b017747736bc3f5d1de1d694b45`. O resultado não determina se outro endereço válido existe.

## Possíveis fontes adicionais, ainda fora do catálogo

| Board público | Itens / menções no RSS | SHA-256 do RSS |
| --- | ---: | --- |
| [arosetf/handbuilding](https://www.pinterest.com/arosetf/handbuilding/) ([RSS](https://www.pinterest.com/arosetf/handbuilding.rss)) | 25 / 9 | `b5d09cd0075496eb9682e2ab296a6f56aed884996457569aed93423975868959` |
| [mearthtoo/pottery-mugs-cups](https://www.pinterest.com/mearthtoo/pottery-mugs-cups/) ([RSS](https://www.pinterest.com/mearthtoo/pottery-mugs-cups.rss)) | 26 / 4 | `f83594ab7524e37c549e391c9ba61c72c540ca9204bb99a6551ba106886689dc` |
| [wayneandtree/hand-building](https://www.pinterest.com/wayneandtree/hand-building/) ([RSS](https://www.pinterest.com/wayneandtree/hand-building.rss)) | 26 / 3 | `c5306b33becae58d210bda492e7c4264bcfa99c64fdb5139008eedf376ed98e5` |

Propõe-se avaliar manualmente o primeiro board por possível pertinência a objetos de cerâmica, textura e gestos de produção. Os dois outros só tiveram metadados consultados. A presença de termos e o título do board não estabelecem a pertinência de cada pin, nem sua qualidade para uma peça final.

## Inspeção visual limitada

Foram consultadas cinco miniaturas de 236 px do primeiro board; nenhuma imagem integral foi baixada. Os quatro primeiros são itens consecutivos do RSS e o quinto foi escolhido por mencionar alça de caneca. É uma amostra de conveniência, insuficiente para estimar a qualidade ou a distribuição do board. Os hashes identificam os bytes das miniaturas observadas.

| Pin e miniatura | Observação visual | SHA-256 da miniatura |
| --- | --- | --- |
| [Pin 1](https://www.pinterest.com/pin/e1_AfqPShwLfhZlwSG-Ok63aoYioKOqCCc1mVYz52LgCh6fCxZJM3_B/) · [miniatura](https://i.pinimg.com/236x/8c/56/bb/8c56bb2f28e43d9377bf01e858a37273.jpg) | Recipientes de formas geométricas sobre uma bancada. | `eab26df0f81d83376287b389d6040f5625ec2ff60103be85156f93bd6f829814` |
| [Pin 2](https://www.pinterest.com/pin/e1_AfqPShxkt_dB6oAwpvssPBZu9wzE1SxTpRAopx_9kHRmmgSMyGSn/) · [miniatura](https://i.pinimg.com/236x/00/66/09/0066094cf3f827b02415972bb07a2905.jpg) | Caneca clara com uma bicicleta ornamental aplicada à frente. | `90cfd030966ba2ea152d433b6fb23c4c10beb8925e3a582505f3791f29f986ec` |
| [Pin 3](https://www.pinterest.com/pin/e1_AfqPShxya3jiwNs_FS8WOzVs87TGGmbvYIOYt5ml08nzYzfhvsUx/) · [miniatura](https://i.pinimg.com/236x/48/da/e9/48dae9e9f02ade9bfecd5ca04fd330d0.jpg) | Três pratos claros de bordas irregulares em composição com ramos de algodão. | `660a16069e858e5270d3235ec3b48c270620accdbe294e25fb932bdda4235874` |
| [Pin 4](https://www.pinterest.com/pin/e1_AfqPShyEEV7QvTOfD-sNTk0fjZTz_dZb3UTld-nf2VphblDJjvbC/) · [miniatura](https://i.pinimg.com/236x/6b/da/20/6bda2079fb608d6caaf0a60b3c97bfa5.jpg) | Dois vasos claros com superfície de aparência segmentada. | `5aefa2cd33608862b36ee89f4b282ce5faa52a14c2c9a05750444f5f10b44b20` |
| [Pin de alça](https://www.pinterest.com/pin/e1_AfqPShwaf8Q3MCdeVpWIwRpKVUYQRqAQOnj7trXkhw6MkX38_Ily/) · [miniatura](https://i.pinimg.com/236x/85/fc/6f/85fc6f85bb936f20bbc8685507da6bbb.jpg) | Caneca cinza e mão junto à alça sobre uma mesa, sugerindo um gesto de trabalho. A imagem pequena não confirma a técnica exata. | `90e1b128de004403c467b3ed6fe54aac3c09abd448c459ac919c1ec950353b17` |

## Decisão pendente e limites

Para uma expansão eventual, revisar objetos, materiais, gestos, composição e pertinência ao briefing; excluir pins que não atendam esses critérios e registrar a origem exata. O board proposto está fora da lista atual: sua inclusão mudaria o escopo e precisa de decisão explícita do responsável antes de ativação, além do consentimento de busca da pessoa previsto na política. Manter a opção de seguir sem referência. A consulta pública exploratória aqui não autoriza essa inclusão nem prova uso pelo Phoenix.

Pinterest e os pins podem conter republicações: disponibilidade pública, legenda e presença no board não comprovam autoria, licença, permissão de reprodução ou uso comercial. É necessário verificar a origem e os direitos por referência antes de qualquer reutilização; as miniaturas foram consultadas apenas para avaliação. Não foram transferidas imagens integrais.

A avaliação cega anterior dos nove candidatos pós-correção de SID encontrou notas `1,1,1,0,0,1,1,1,1`, sem nota útil ≥2. Esta inspeção não foi uma comparação cega pareada nem teste de recuperação com a nova fonte: ela não prova melhoria de ranking, qualidade criativa, implantação ou desempenho do sistema.

## Proposta concreta para decisão

Se o responsável aprovar esta expansão específica, incluir apenas `arosetf/handbuilding` como board permitido da fonte `pinterest_curated_photography` em `sources_catalog.json`, com escopo de inspiração. Acrescentar o slug ao catálogo canônico Phoenix e uma rota editorial para pedidos de cerâmica manual; testar que não há consulta ao feed inteiro da conta, que outras fontes continuam bloqueadas, que o consentimento de pesquisa e de envio de miniaturas permanece separado, e que a pessoa pode recusar todas as referências. Executar um novo ensaio cego com rótulos prévios e preservar a avaliação antiga. A presença no board não concede licença nem autoriza cópia, publicação ou uso integral.

Esta é apenas uma proposta revisável: a allowlist, o roteador e a experiência ativa não foram modificados para este board. O catálogo canônico e o de fontes são dois controles distintos; adicionar apenas ao JSON não basta para o roteador Phoenix alocá-lo. A amostra pequena não justifica promover a fonte como melhora comprovada.
