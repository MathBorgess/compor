# ADR 0082 — Renderizador determinístico de carrossel

O ADR 0080 documenta a geração de arte integral. O ADR 0081 vincula os PNGs dessas lâminas às versões. O renderizador de carrossel introduz uma composição adicional para planos em que o texto e os elementos visuais têm papéis distintos.

## Porta de integração

O laboratório e a rota Node do estúdio compartilham os arquétipos do pacote `@compor/carousel-renderer`. A rota `POST /api/studio/carousel/render` fica disponível com `COMPOR_CAROUSEL_RENDER_ENABLED=true`. Exige a origem do aplicativo, uma sessão autenticada e a propriedade do projeto. Recebe um único plano JSON pequeno com texto, paleta e diagramas parametrizados. O servidor valida os campos e limita a geração a uma composição simultânea por processo. O Chromium opera com rede bloqueada, fontes empacotadas e DPR 2. O Sharp normaliza as saídas em JPEG 1080 × 1350, sRGB, 4:4:4 e não progressivo.

O pedido compõe em memória. O ZIP preserva os JPEGs compostos, a legenda, o alt text e os artefatos de diagnóstico físico. Os hashes no manifesto ligam o plano e os arquivos daquela resposta. Uma falha física bloqueia o ZIP. O manifesto e a rota cobrem a validação determinística da composição. Gate 0 editorial, evidências de origem e avaliação de coleção completa são contratos da geração e da promoção.

## Adoção pelo estúdio

O compositor e a rota são a primeira etapa da integração. A conversa ainda segue o plano de lâminas e a geração dos ADRs 0080 e 0081. Para aceitar um plano composto no estúdio, a ação de render precisa reunir uma revisão congelada da peça, a cópia autorizada e eventuais referências de arte limpa com identidade e hashes separados. Edições de copy, ordem, tema ou referências invalidam o vínculo com a composição anterior. Somente os bytes da composição da revisão atual podem ser salvos como o novo produto final.

Os artefatos de uma versão seguem o contrato canônico que os gravou. Estender o salvamento para JPEGs requer um contrato de leitura e escrita que preserve seus bytes e a recuperação em outra sessão, incluindo resultado parcial e repetição idempotente. Dados e permissões dos projetos continuam sob a autoridade do servidor e das políticas existentes.

## Diagramas de categorias e orientação

O plano aceita `category_split` para duas categorias independentes, cada uma com seu exemplo em uma placa de igual destaque. `orientation` mostra a mesma amostra em duas placas, com a da direita girada em 180° e as duas legendas na posição de leitura. Os dois arquétipos de demonstração usam texto da composição sujeito aos gates de contraste, piso e geometria. O planejador escolhe a demonstração pela relação que a lâmina precisa comunicar.

A migração `20261123000050` admite as duas formas no plano salvo e mantém a validação dos formatos anteriores. Alterar os exemplos de categoria ou o texto da amostra exige nova composição antes de salvar os JPEGs. Os testes locais passaram pelo plano do estúdio, a rota autenticada com Chromium, o salvamento simulado e a recuperação do ZIP em um navegador sem cache. Os testes em PGlite verificaram a migração e o vínculo entre o diagrama salvo e o digest do plano.

Quando a última lâmina precisa demonstrar uma distinção pedida pelo briefing, `cta_closing` admite uma comparação governada na faixa superior. A manchete indica o que observar e o único pedido de interação ocupa o corpo em uma área própria. O painel recebe os mesmos slots, limites e gates dos outros arquétipos de comparação. A migração admite esse arranjo no plano salvo e o digest inclui a demonstração. No caso tipográfico, o fechamento usa apenas a área de texto.

O planejador reserva `flow`, `balance`, `steps` e `focus` para as lâminas de conteúdo. Se um rascunho enviar uma dessas formas em `cta_closing`, o renderer retorna `CTA_DIAGRAM` com a posição da lâmina antes de gerar JPEGs. O estúdio indica onde mover o diagrama. Versões salvas continuam disponíveis com os JPEGs que já tinham sido conferidos.

Nas capas com diagrama acima do texto, a grade reserva primeiro a altura intrínseca da cópia e a margem inferior de 180 px. A faixa do diagrama usa o espaço disponível até a altura preferida do arquétipo. A amostra de uma comparação semântica conserva a altura necessária aos seus rótulos. O split horizontal reserva 360 px para o diagrama de comparação. Em `comparison_dual` com comparação semântica, a manchete de capa usa 116 px.

Capas com SVG básico em `split_horizontal`, `framed_plate`, `svg_diagram` ou `comparison_dual` começam com manchete de 108 px. O split horizontal do miolo reserva ao SVG básico seus 360 px de altura. Fotografias e comparações semânticas mantêm as medidas do seu arquétipo. A matriz nativa no miolo usa manchete de 74 px e corpo de 44 px para acomodar o quadro na zona de leitura. Esses tamanhos são os valores iniciais antes de medir e reparar o layout. Os gates e pisos existentes continuam em vigor.

## Matriz de legibilidade em notas

O modo `native_serial` admite `{"type":"readability_matrix"}` em uma lâmina do mesmo arquétipo, com a posição das notas preservada. A coleção precisa de pelo menos quatro lâminas para que o quadro caiba no limite de 30% de cobertura visual. A matriz usa as palavras fixas “Oferta” e “Detalhes” para isolar uma mudança por linha. O quadro compara tamanho, contraste e hierarquia em pares “Antes” e “Com ajuste”. A lâmina tem texto alternativo próprio. Os rótulos que explicam as diferenças passam pelo gate de contraste. O contraste insuficiente aparece na amostra didática de antes.

A migração `20261123000051` valida a forma exata do diagrama, o modo e o arquétipo. O quadro é composição do renderer. A validação de `artSha256` continua exigindo que o raster ocupe um slot de mídia próprio. O digest guarda a escolha de diagrama. As palavras fixas dispensam campos editáveis de rótulo e amostra nesse contrato.

## Comparação de espaçamento

`editorial_art` admite `{"type":"spacing"}` no layout `svg_diagram`, com um par de placas e rótulos fixos. A forma central se repete na mesma escala, posição e cor. Só as coordenadas dos elementos vizinhos mudam. O `alt` da lâmina descreve a mudança. O painel usa as cores de texto e destaque da mesma paleta, sujeitas aos gates do renderer.

A migração `20261123000052` admite a receita exata na persistência. O quadro ocupa o slot de composição do SVG, com JPEG, descrição e digest vinculados à versão como nos demais painéis. O fluxo autenticado local com identidade simulada conferiu o ZIP e a integridade do JPEG. O teste em PGlite verificou a receita, as restrições do arquivo, o vínculo ao recibo e a leitura de versões anteriores.

## Evidência para habilitação

Executar o fluxo autenticado da rota em Linux no Preview da Vercel. Verificar o fechamento do Chromium em falha, os arquivos presentes no trace, o orçamento de tamanho do ZIP e o comportamento para planos recusados. Vínculo à versão e recuperação em outro navegador exigem mais uma verificação depois que o estúdio consumir esse contrato.

Em 23/11/2026, uma prévia de diagnóstico compilou o código de render de `1a2e261` com um `postbuild` restrito à sua branch. O log registrou Linux x64, Node 24.22.3, 556 entradas no trace da rota e dez arquivos conferidos, incluindo Chromium Brotli, bibliotecas do Sharp e as fontes. Passaram nove testes, incluindo extração a frio, captura Chromium em 2× com Sharp e fechamento do navegador. A chamada autenticada da Function publicada e seu comportamento sob os limites de runtime ainda precisam de evidência. [Commit do canário](https://github.com/MathBorgess/compor/commit/c4e3bd1bc5a6c72c86a46d12dc2529788009de15) · [Build de diagnóstico](https://vercel.com/math-ai2/compor/9m7wWFxyQaaoMuCh7dGFGLrTqcP8)

Uma segunda prévia executou um canário temporário na Function publicada, com identidade e projeto sintéticos. As três recusas esperadas por origem, sessão ausente e projeto alheio retornaram 403, 401 e 404. A composição chegou a Linux x64 e respondeu 503. A instrumentação localizou a falha no import do Playwright após carregar fontes e Sharp. A versão do pacote já utilizada no renderer, `1.63.0`, foi instalada sob o nome canônico. O import compilado ainda retornou `MODULE_NOT_FOUND` na Function. [Prévia instrumentada](https://vercel.com/math-ai2/compor/D4XB46trVipzjqP3VcrPa1nVYZFF) · [Diagnóstico com nome canônico](https://vercel.com/math-ai2/compor/5ugoQVco58M1c5b6i62coPonV4Na)

O runtime resolve o Playwright pelo `createRequire` do Node a partir do diretório da aplicação. A configuração inclui os arquivos originais do pacote no trace desta rota. O build verificou 114 entradas do Playwright. Com essa mudança, a Function de diagnóstico Linux x64 respondeu HTTP 200 em 4,505 s nesta execução. O ZIP de 253.230 bytes contém três JPEGs, legenda, alt text, manifesto e as duas folhas de revisão. O canário conferiu CRC e hashes dos oito arquivos e preservou as recusas 403, 401 e 404. O SHA-256 do ZIP é `de56e7ed1828c508de4b2d3f499ccd1f880a00488d3141a617172e852e1db461`. A autenticação e o Storage reais continuam pendentes de verificação. [Trace do Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) · [Commit do canário](https://github.com/MathBorgess/compor/commit/bf6ea2354bf540b41443d68de9183dcae125ec46) · [Prévia do canário](https://vercel.com/math-ai2/compor/DdYauNMUQF9Fzgh9z7ux8PAzWTuf)
