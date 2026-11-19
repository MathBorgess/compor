# Adaptador isolado da Images API

`createImageHandler` recebe um autenticador fornecido pelo servidor e trata requisição HTTP `POST` com `apiKey`, `prompt` e `authorizeGeneration: true`. A chave existe somente durante a requisição e fica fora de disco, banco e logs. Em sucesso, a resposta interna traz o PNG em base64 com `Cache-Control: no-store`. Aprovação e publicação são decisões externas ao adaptador. O prompt da operação orienta os textos dentro da arte.

A chamada usa `gpt-image-2.6-flare`, tamanho `1024x1280`, qualidade `auto`, formato PNG e uma imagem. A [prova sintética anterior](../../docs/spikes/2026-11-03-validacao-sintetica-openai.md) usou `gpt-image-2.5-flare` em qualidade `low` e recebeu uma imagem com assinatura PNG. Os limites são 3 MiB na requisição interna, 2 MiB para o total decodificado das imagens de entrada e 12 MiB na resposta JSON do provedor. O PNG retornado ocupa até 8 MiB, tem até 2048 pixels por eixo e contém uma imagem estática. O adaptador confere os blocos, seus CRCs e a descompressão limitada dos dados da imagem antes da revisão ou entrega. Contadores válidos de tokens e detalhes numéricos de texto e imagem são retornados. Valores ausentes ou inválidos ficam como `null` e o valor faturado tem sua própria fonte. [Especificação PNG](https://www.w3.org/TR/png-3/)

Falhas após envio, incluindo timeout, erro do provedor ou resposta inválida ou maior que o limite, retornam `generation_result_unknown`. A imagem pode ter sido gerada ou cobrada. Uma credencial explicitamente recusada retorna 401 ou 403. O adaptador realiza um envio por chamada.

A revisão opcional recebe o PNG validado e o prompt. Quando o servidor fornece `reviewCandidate`, só um parecer explícito `approve` com `findings: []` libera os bytes. Reprovação fundamentada retorna `422 image_quality_rejected`. Uma resposta incerta, inválida, atrasada ou interrompida retorna `503 image_quality_inconclusive`. Ambos incluem `retryAutomatically: false` e o uso conhecido da geração. O adaptador usa o juiz fornecido pelo servidor. O estúdio pode compor `createOpenAiImageCandidateReviewer` com credencial dedicada. Em modo obrigatório, o servidor revalida a autorização antes do envio e da liberação. [Contrato e condições de ativação](../../docs/adr/0075-revisao-de-candidatas-a-imagem.md)

Os testes usam serviços simulados e dispensam credenciais.

```sh
npm test
```

As rotas autenticadas do estúdio vinculam a operação ao usuário, ao projeto e à autorização antes de chamar o adaptador. Reservas, idempotência durável, armazenamento privado e recuperação pertencem aos chamadores. [Arquitetura do Compor](../../docs/architecture.md)
