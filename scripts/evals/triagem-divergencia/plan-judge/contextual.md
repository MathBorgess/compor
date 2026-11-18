# Suplemento J2 do juiz de divergência

Em desenvolvimento, a primeira rodada apresentou fichas em que o juiz não conseguia determinar se uma referência citada havia sido disponibilizada pela pessoa. J2 acrescenta ao pacote J1 o catálogo ordenado de IDs selecionados, sua origem e os IDs efetivamente retidos no plano. O juiz encontra os nomes declarados pela pessoa no briefing já existente. A rubrica, o modelo, o esforço, o schema das notas, as verificações de evidência e o critério de admissão vêm de J1. A inspeção dos atributos visuais pertence ao juiz de triagem e a avaliação das artes, ao juiz de pixels.

O grupo continua cego com cinco fichas por braço, nomes aleatórios e sessão isolada via login ChatGPT. A seleção é uma entrada do pedido. O pacote exclui o gabarito, interpretação do planejador, notas de outros juízes e rótulos experimentais. Um plano ausente gera abstenção. O sujeito de J2 combina o digest J1 do briefing, propostas e subsequência com o digest do manifesto completo, incluindo a origem, ordem e hashes de transporte. É necessário comparar J1 e J2 separadamente. J2 foi proposto depois de se observar uma falha nas fichas de desenvolvimento da primeira rodada.

A partir da raiz, congele os pacotes e depois execute os dois grupos. Use a mesma versão do código para as rodadas comparadas.

```sh
node scripts/evals/triagem-divergencia/plan-judge/contextual-round.mjs "$EVIDENCIAS" 0 --prepare
node scripts/evals/triagem-divergencia/plan-judge/contextual-round.mjs "$EVIDENCIAS" 0
node --test scripts/evals/triagem-divergencia/plan-judge/contextual.test.mjs
```

Para outra rodada, troque o argumento numérico por um inteiro de 0 a 5. A pasta nova `round-R/j2/` contém um `j2-review.json` por caso e braço e o diretório `panel-private` com mapeamento dos identificadores, hashes de fontes, pacote enviado, resposta e recibo de sessão por grupo. Em um grupo já concluído o executor lê o recibo existente. Se houver início registrado e resposta indeterminada, ele interrompe antes de iniciar outra sessão.

Antes de qualquer despacho experimental, chame `verifyContextualRoundReview(raiz, rodada, caso, braço)` exportada por `contextual-round.mjs`. A função verifica por leitura local o recibo, a resposta original e os hashes de fontes e pacote, reconstrói o sujeito com os arquivos selecionados e reaplica o critério de admissão. Somente o resultado `admit` satisfaz este juiz. A elegibilidade para pares, o teto, os recibos por slot, a ausência de efeito anterior e a validação alvo dos pixels continuam a cargo do executor. O parecer J1 original permanece disponível para a comparação emparelhada.
