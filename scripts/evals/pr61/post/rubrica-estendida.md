# Marco 5 estendido — Copy na imagem, perfil e multi-formato

O juiz observa uma bancada sintética cega cobrindo os quatro modos nativos do Instagram (`single` 4:5, `carousel` 4:5, `collection` 4:5 e `story` 9:16), o perfil de voz (`brandVoice`), os fatos confirmados e, quando presente, a legenda separada da arte. A ordem dos casos é embaralhada por hash reproduzível; o juiz desconhece revisão, skill aplicada, divisão (`desenvolvimento`/`reserva`) e notas anteriores.

## Dimensões universais (0 a 2, com evidência literal ou visual obrigatória)

- **Gancho (`gancho`):** `2` quando texto na imagem e mecanismo visual conectam uma dor, cena, contraste ou promessa específica ao objetivo e passam no *Teste da Troca de Concorrente* (não serve para qualquer perfil genérico); `1` para apelo genérico ou metáfora frouxa; `0` se ausente ou contraditório.
- **Adequação ao perfil (`adequacaoAoPerfil`):** `2` quando vocabulário, registro e ritmo respeitam `brandVoice` (tom e exemplos), evitam todos os termos/estilos em `avoid` e não usam clichês de IA (*"Não é sobre X, é sobre Y"*, *"Sem X, sem Y, sem Z"*, *"destrave"*, *"revolucione"*); `1` quando o tom é neutro/correto mas sem aderência perceptível ao perfil; `0` quando contradiz o tom, usa expressão proibida ou soa artificial.
- **Leitura (`leitura`):** `2` quando manchete, foco visual e dados obrigatórios são recuperáveis sem esforço no painel de `360 px`, sem colisões de ornamentos com texto e com respiro adequado; `1` se há esforço; `0` se ilegíveis.
- **Adequação ao objetivo (`adequacao`):** `2` quando o próximo passo, CTA ou identificação pedida é inequívoco e fiel à oferta (respeitando posts de autoridade sem chamada comercial); `1` quando implícito ou ambíguo; `0` quando contraditório ou ausente.
- **Sinergia com a legenda (`sinergiaLegenda`):** avaliada quando o caso inclui legenda. `2` quando a legenda aprofunda contexto, história ou ação sem repetir a manchete da arte palavra por palavra e preservando o tom do perfil; `1` quando apenas repete a arte ou fica rasa; `0` se contradiz a arte ou os fatos.

## Dimensões condicionais por formato (0 a 2)

- **Carrossel (`carousel`) e Coleção (`collection`):**
  - **Coesão visual (`coesaoVisual`):** `2` quando todas as lâminas parecem pertencer à mesma peça/série (paleta, tipografia, luz/grade e margens consistentes com a Lâmina 1 âncora); `1` quando há desvio perceptível em alguma lâmina; `0` quando parecem peças soltas sem unidade.
  - **Progressão ou ritmo (`progressaoOuRitmo`):** em **Carrossel**, `2` exige arco narrativo claro (capa → desenvolvimento com 1 ideia por slide e continuidade/open loop → fechamento) sem excesso de texto; em **Coleção**, `2` exige cadência intencional de planos/enquadramentos (abertura, detalhe, uso/cena) com texto mínimo ou ausente nas fotos internas. `1` para variação tímida ou repetitiva; `0` para sequência desconexa ou moldes idênticos.
- **Story (`story` · 9:16):**
  - **Zonas seguras (`zonasSeguras`):** avaliada no painel `360 px` com guia de zonas seguras (`15%` topo, `25%` base, `16%` faixa lateral direita). `2` quando nenhum texto crítico, logo ou dado obrigatório invade topo/base/lateral e não há botões clicáveis falsos desenhados sem pedido; `1` quando encosta no limite; `0` quando texto obrigatório fica encoberto pelas áreas de UI.

## Portão factual crítico (`fidelidadeFactual`)

Conferir literalmente todos os fatos confirmados, grafia, datas, preços e restrições de `brandVoice.avoid`. Qualquer omissão de fato obrigatório, alteração literal, promessa/preço/gratuidade inventada ou violação direta de expressão proibida registra falha crítica e torna `fidelidadeFactual = "infiel"` (`prontaNoProxy = false`).

Uma peça conta como **pronta no proxy** somente quando `fidelidadeFactual == "fiel"` e **todas** as dimensões aplicáveis ao formato recebem nota `2`. A suíte de desenvolvimento orienta revisões; a reserva permanece fechada até fechar as rodadas comparadas.
