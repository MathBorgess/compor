# Instruções congeladas das cinco candidatas

R0 usou a instrução visual da produção, `triageInstructions`. SHA-256 do arquivo `9cd69039fe22328f7cd0ad903a8b9c769c787216620f333d893118bf49e64e5f`. [Planejador da baseline](https://github.com/MathBorgess/compor/blob/41e1f8c3b5c8efd27fe240129017f072a052acd3/packages/agents-api/src/exploration-plan-provider.mjs#L7)

R1 a R5 usam a base experimental `plannerInstructions`. Cada texto abaixo é a revisão cumulativa completa daquela rodada. Para reproduzir a instrução efetiva, passe somente o texto da respectiva rodada a essa função. SHA-256 do arquivo da função `7531b6484a1f3ab16a8b9352a9696cc9c8dfc767acca4a33b0a27fda04cac49c`. [Base experimental e composição da instrução](https://github.com/MathBorgess/compor/blob/b35d624f0b2e6fa250bfcf722b735a1afeebf62e/scripts/evals/triagem-divergencia/planner/candidate.mjs#L26)

Os hashes de texto usam UTF-8 e preservam os caracteres exatos do campo `revision`. O hash de feedback é calculado sobre os bytes do arquivo de desenvolvimento da rodada precedente. A hipótese e a previsão foram registradas antes da execução de cada candidata.

SHA-256 do protocolo `15a55ed9d834a46a86b2752002036806a74e2b17065855d39a058907e0399d9d`. Identificador do corpus congelado `df5c184b667eb6adfc2c7dac0d71339f3757c91c1c90e59033cc25d4fe6d26a2`.

## R1

**Hipótese**

A falha recorrente está na passagem da triagem para as composições. O plano decide corretamente quais referências usar, mas deixa que uma menção à função substitua a descrição do traço visual e a instrução concreta de aplicação. Vincular esses três elementos em cada opção deve reduzir essa lacuna.

**Previsão**

Na próxima rodada de desenvolvimento, com a mesma avaliação, mais referências obrigatórias terão um traço distintivo e uma aplicação localizável descritos nas três opções, mantendo o acerto das decisões de uso e omissão. A hipótese perde força se as menções genéricas persistirem ou se a melhora vier acompanhada de erros nessas decisões.

| SHA-256 | Valor |
| --- | --- |
| Revisão desta rodada | `85ee54a91e07a61f39ae5f91992d6d6c94f60009f46585d11ccf2aea642b6c45` |
| Instrução efetiva enviada ao planejador | `295a5fb723b022ee0cd190779ea4b3826347469ed92b46a3f83399776526c657` |
| Feedback de desenvolvimento de R0 | `5f765e5c784621260f987df32bdc9e26655b07303f28c240da9e1a47126e0f35` |

~~~text
Antes de compor, identifique a função autorizada de cada referência e o traço observável que importa para essa função. Preserve todos os uploads obrigatórios. Use uma referência opcional somente quando estiver disponível, autorizada e contribuir para a direção. Quando seu uso depender de seleção, vincule a aplicação a essa seleção. Mantenha as exclusões pedidas. Em cada uma das três composições, explicite para cada referência mantida o traço a preservar ou aproveitar, onde e como ele entra na arte e a condição visual que torna sua aplicação verificável. Descreva cada referência individualmente, inclusive quando várias cumprem a mesma função. Limite a aplicação aos aspectos autorizados e descreva apenas traços sustentados pelo material disponível. Preserve os fatos e os requisitos de direção nas três propostas. Varie a organização dos elementos, o percurso do olhar e a forma de criar contraste nos eixos em que houver liberdade. Compare as três propostas aos pares e amplie a diferença entre as mais parecidas até alcançar a maior divergência permitida pela direção.
~~~

## R2

**Hipótese**

A instrução atual permite considerar duas propostas suficientemente diferentes quando elas mudam a organização ou o elemento em destaque, mas mantêm a mesma relação visual como principal fonte de contraste. Definir essa relação em cada proposta e compará-la aos pares deve reduzir a equivalência de contraste.

**Previsão**

Ao repetir a avaliação nos mesmos seis planos de desenvolvimento com o gate atual, menos de seis serão retidos por equivalência do contraste principal, com pelo menos uma redução em cada grupo. As 15 decisões de referência continuarão corretas e todas as referências continuarão com plano.

| SHA-256 | Valor |
| --- | --- |
| Revisão desta rodada | `9c779ce8193aca71261c1ed5ed77846a26b725fcac23b4938150973d10a5dde6` |
| Instrução efetiva enviada ao planejador | `f297891eaeb0131a70d7800aeb68bb48f0bea65824f40fa06723f6c27f79c414` |
| Feedback de desenvolvimento de R1 | `e6e4ca60c828a5b0f94d21f5ef8b09ff695ac0e613d875bb853d3bc50c2f4e09` |

~~~text
Antes de compor, identifique a função autorizada de cada referência e o traço visual observável relevante para essa função. Preserve todos os uploads obrigatórios. Use uma referência opcional somente quando ela estiver disponível, autorizada e contribuir para a direção. Quando o uso depender de seleção, aplique a referência apenas se ela for selecionada. Respeite as exclusões pedidas. Em cada uma das três composições, descreva individualmente cada referência mantida, mesmo quando várias cumprirem a mesma função. Indique o traço a preservar ou aproveitar, onde e como aplicá-lo e o que deve ser visível na arte para verificar sua aplicação. Use somente aspectos autorizados e traços sustentados pelo material disponível. Preserve os fatos e os requisitos de direção nas três propostas. Nos eixos em que houver liberdade, varie a organização dos elementos e o percurso do olhar. Para cada proposta, indique quais elementos ou áreas produzem o contraste principal, qual propriedade visual os diferencia e como essa diferença orienta a leitura. Compare os três pares quanto à estrutura e ao contraste principal. Se um par depender da mesma propriedade visual para produzir o contraste principal, mudar o elemento em destaque, sua posição ou a intensidade dessa propriedade mantém o mesmo mecanismo. Refaça uma das propostas com outra propriedade visual quando a direção permitir, tornando-a perceptível na composição. Quando a direção fixar o contraste, preserve-o e amplie a diferença nos eixos livres. Depois de revisar uma proposta, confira os dois pares que a incluem para maximizar a divergência do conjunto.
~~~

## R3

**Hipótese**

A instrução pede um traço observável, mas deixa implícita a conferência da descrição com a referência antes de reutilizá-la. Conferir os detalhes que distinguem o traço na função autorizada deve reduzir erros que se propagam pelas três propostas.

**Previsão**

Em uma rodada de desenvolvimento comparável, a proporção de referências com nota abaixo da máxima no traço visual deve cair em relação a 6 de 15, e menos erros de descrição devem aparecer nas três propostas do mesmo caso. As decisões sobre referências devem continuar corretas. Se a proporção de notas abaixo da máxima ficar igual ou subir, a hipótese perde apoio.

| SHA-256 | Valor |
| --- | --- |
| Revisão desta rodada | `0916e351b92aeff205b0dcfaafafd20abe3cf31632d3596bd48a655442217233` |
| Instrução efetiva enviada ao planejador | `8fef055fccb70d2badfd420202937a4d62cc3ea1035c668993cb407149462425` |
| Feedback de desenvolvimento de R2 | `aee113ecab5535c9a9b1d4a2136083e1ad6b2ca97133e86e982a7c635d1d6103` |

~~~text
Antes de compor, identifique a função autorizada de cada referência e o traço visual relevante para essa função. Confira a descrição diretamente na referência disponível. Quando forem relevantes para a função, verifique o contorno, a relação entre aberturas e bordas, a cor e as relações espaciais. Descreva esses detalhes com a precisão que o material sustenta. Se um detalhe estiver incerto, use a descrição mais específica que puder confirmar. Preserve todos os uploads obrigatórios. Use uma referência opcional somente quando ela estiver disponível, autorizada e contribuir para a direção. Quando o uso depender de seleção, aplique a referência apenas se ela for selecionada. Respeite as exclusões pedidas. Em cada uma das três composições, descreva individualmente cada referência mantida, mesmo quando várias cumprirem a mesma função. Indique o traço conferido, onde e como aplicá-lo e o que deve ficar visível na arte para verificar sua aplicação. Confira se a descrição em cada proposta preserva os detalhes observados e respeita a função autorizada. Preserve os fatos e os requisitos de direção nas três propostas. Nos eixos em que houver liberdade, varie a organização dos elementos e o percurso do olhar. Em cada proposta, indique quais elementos ou áreas produzem o contraste principal, qual propriedade visual os diferencia e como essa diferença orienta a leitura. Compare os três pares quanto à estrutura e ao contraste principal. Se um par usar a mesma propriedade visual para produzir o contraste principal, considere o mecanismo compartilhado mesmo quando mudarem o elemento em destaque, sua posição ou a intensidade da propriedade. Refaça uma das propostas com outra propriedade visual quando a direção permitir e torne essa diferença perceptível na composição. Quando a direção fixar o contraste, preserve-o e amplie a diferença nos eixos livres. Depois de revisar uma proposta, confira novamente os dois pares que a incluem para maximizar a divergência do conjunto.
~~~

## R4

**Hipótese**

A divergência de contraste se torna verificável quando cada proposta exige as condições visuais que fazem seu mecanismo dominar a leitura. Se essas condições ficam implícitas, um recurso compartilhado pode continuar definindo o contraste principal em duas propostas de estruturas distintas.

**Previsão**

Na próxima rodada de desenvolvimento, entre pares estruturalmente distintos com liberdade para variar o contraste, deve cair a proporção de contrastes classificados como incertos. Nas propostas que mudarem, o avaliador deverá conseguir apontar no próprio texto os elementos, a propriedade visual e a condição que torna cada mecanismo dominante. A taxa de decisões corretas sobre referências deve se manter.

| SHA-256 | Valor |
| --- | --- |
| Revisão desta rodada | `dee14c66aeeb9f5ace180cf81e2d091ef58e48ae564c7f8b8a51eeae68964640` |
| Instrução efetiva enviada ao planejador | `52852e7e9e08d70a454075a8ac2abbc6900eea440d98cb6dd7ec60120c3613da` |
| Feedback de desenvolvimento de R3 | `47d7fb1adb65920bde13ca65c1677b42360d536fe6cb887eec066bfcb9ac5475` |

~~~text
Antes de compor, identifique a função autorizada de cada referência e confira diretamente no material os traços relevantes para essa função. Quando importarem, verifique o contorno, a quantidade de aberturas, sua relação com as bordas, as cores e as relações espaciais. Use a descrição mais específica que o material sustentar. Preserve todos os uploads obrigatórios e respeite as exclusões. Use uma referência opcional somente quando estiver disponível, autorizada e contribuir para a direção. Quando o uso depender de seleção, aplique a referência apenas se for selecionada. Em cada uma das três propostas, descreva separadamente cada referência mantida, mesmo quando várias cumprirem a mesma função. Indique o traço conferido, onde e como aplicá-lo e o que deve ficar visível para verificar sua aplicação. Confira cada descrição com a referência e com a função autorizada. Preserve os fatos e os requisitos de direção nas três propostas. Nos eixos livres, busque a maior divergência possível na organização dos elementos, no percurso do olhar e no mecanismo de contraste principal. Em cada proposta, indique quais elementos ou áreas produzem esse contraste, qual propriedade visual os diferencia e como a diferença orienta a leitura. Escreva na própria proposta as condições espaciais e visuais que precisam ficar visíveis para que esse mecanismo lidere a leitura. Se outro contraste permitido competir pela atenção, especifique como ele ficará subordinado. Compare os três pares pela estrutura e pelo contraste principal usando apenas o que cada proposta exige na arte. Se a diferença depender de uma condição implícita, explicite essa condição. Se o par continuar usando a mesma propriedade visual como contraste principal, mesmo com mudanças de posição, intensidade ou elemento em destaque, refaça uma das propostas com outro mecanismo quando a direção permitir. Quando a direção fixar o contraste, preserve-o e amplie as diferenças nos eixos livres. Depois de cada revisão, confira novamente os dois pares que incluem a proposta alterada.
~~~

## R5

**Hipótese**

A conferência atual permite que uma primeira leitura imprecisa seja reaproveitada nas três propostas. Confrontar diretamente com a fonte a descrição inicial e o que cada proposta pede que apareça deve reduzir a propagação de erros de forma, cor e relação entre figura e fundo.

**Previsão**

Em uma nova execução sobre os mesmos casos de desenvolvimento, com a avaliação vigente, a pontuação de caracterização deve superar 13 de 18 e a de uso deve atingir pelo menos 16 de 18. Deve cair o número de erros de leitura repetidos nas três propostas, com as nove decisões sobre referências ainda corretas e os três planos admitidos.

| SHA-256 | Valor |
| --- | --- |
| Revisão desta rodada | `1aed876e76aae8d31e3c0ad747cc5a04104325fce40bc72206f9993cfdecb658` |
| Instrução efetiva enviada ao planejador | `71699a59c89bf9d89a20fc5bfd0c3731dcaf31e9b7000773c8481cefb45bd06e` |
| Feedback de desenvolvimento de R4 | `318fe6d000d524cc9e59b2cf2abc6fafc65bf3599cfc6c64c854034374b9ea6e` |

~~~text
Antes de compor, identifique a função autorizada de cada referência e confira diretamente no material os traços relevantes para essa função. Descreva cada traço pela propriedade visível mais específica que a fonte sustentar. Quando forem relevantes, confira o contorno externo e, separadamente, a forma e a quantidade de aberturas, se são fechadas ou alcançam uma borda e qual borda alcançam. Em relações de cor ou luminosidade, identifique a cor ou o tom de cada área, qual área forma a figura, qual forma o fundo e onde cada uma aparece. Quando o fundo estiver visível através de uma abertura, descreva essa relação. Atribua cada cor à sua fonte e preserve as relações espaciais pertinentes. Preserve todos os uploads obrigatórios e respeite as exclusões. Use referências opcionais somente quando estiverem disponíveis, autorizadas e contribuírem para a direção. Quando o uso depender de seleção, aplique a referência apenas se for selecionada. Em cada uma das três propostas, descreva separadamente cada referência mantida, mesmo quando várias cumprirem a mesma função. Indique o traço conferido, onde e como aplicá-lo e o que deve ficar visível na arte. Na revisão final de cada proposta, volte à fonte e confira se a aplicação escrita preserva os traços pertinentes à função autorizada. Se encontrar uma discrepância, corrija a leitura e todas as propostas em que ela aparecer. Preserve os fatos e os requisitos de direção nas três propostas. Nos eixos livres, busque a maior divergência possível na organização dos elementos, no percurso do olhar e no mecanismo de contraste principal. Em cada proposta, indique quais elementos ou áreas produzem esse contraste, qual propriedade visual os diferencia e como essa diferença orienta a leitura. Explicite as condições espaciais e visuais que precisam aparecer na arte para que o mecanismo lidere a leitura. Se outro contraste permitido competir pela atenção, especifique como ficará subordinado. Compare os três pares pela estrutura e pelo contraste principal, considerando apenas o que cada proposta exige que apareça na arte. Explicite qualquer condição da qual a diferença dependa. Se um par ainda usar a mesma propriedade visual como contraste principal, mesmo com mudanças de posição, intensidade ou elemento em destaque, refaça uma das propostas com outro mecanismo quando a direção permitir. Quando a direção fixar o contraste, preserve-o e amplie as diferenças nos eixos livres. Depois de cada revisão, confira novamente os dois pares que incluem a proposta alterada.
~~~
