# Comparação com a avaliação visual cega

Após fechar o parecer em [designer-decision-cego.md](designer-decision-cego.md), consultei `decision-mcp-evidence.json` e a resposta da persona na rodada 11 de `persona-interacoes.md`. A ordenação efetivamente retornada pelo MCP começa com **06 → 05 → 08**. O parecer cego atribuiu, respectivamente, **2 → 2 → 0**. As notas são avaliação de um subagente designer sobre utilidade parcial para o briefing, não escolhas humanas. O documento cego foi preservado sem alteração; o avaliador havia participado do pré-teste antes de examinar este conjunto, portanto a comparação não é um ensaio independente de histórico anterior.

| Posição | ID | Designer | Reação da persona simulada |
|---:|---|---:|---|
| 1 | `phx_48e49c75_06` | 2 | Rejeitou a coleção de telas de celular e apontou que a imagem já havia sido rejeitada no pré-teste. O designer havia identificado apenas hierarquia e respiro transferíveis, com ressalvas de estética fria e montagem. |
| 2 | `phx_48e49c75_05` | 2 | Considerou que há cartões claros e respiro; aproveitaria no máximo a organização, sem copiar conteúdo ou assumir que a peça de outra marca resolve o pedido. |
| 3 | `phx_48e49c75_08` | 0 | Rejeitou o fundo em degradê rosa/roxo, que considerou genérico. |

A imagem 06 é identificável como a prévia rejeitada `ref_ext_f5a71e` pelo mesmo SHA-256 `4aefaeaa379b027ea7bbff56ddcfc1123e0ae8ad9d0e3bc135e9dc3d51e28050`, e pelo URL registrado no manifesto. Essa coincidência prova a recorrência da imagem; por si só não prova que a rejeição anterior tenha sido registrada ou enviada ao motor. O registro `followup_feedback` no arquivo de evidência diz respeito a uma operação posterior à descoberta e não comprova processamento da rejeição anterior.

## Cálculo sobre as notas do designer

O parecer contém três candidatos com relevância 2, IDs 04, 05 e 06, e nenhum com relevância 3. Para a ordem retornada e relevância graduada de 0 a 3, com ganho `2^nota − 1` e desconto `log2(posição + 1)`:

- **DCG@3:** `3/log2(2) + 3/log2(3) + 0/log2(4) = 4,892789`.
- **IDCG@3:** `3/log2(2) + 3/log2(3) + 3/log2(4) = 6,392789`.
- **NDCG@3:** `4,892789 / 6,392789 = 0,765361`.
- **Precisão@3**, definindo nota **≥ 2** como utilidade parcial: `2/3 = 0,666667`.

Essas métricas descrevem apenas a concordância com as notas desse avaliador e desse conjunto de nove miniaturas. O top 3 contém dois itens com atributos que ele considerou parcialmente úteis; nenhum foi considerado direção integral. A persona simulada, por sua vez, rejeitou a primeira imagem, reconheceu apenas a organização da segunda e rejeitou a terceira: isso indica **uma oportunidade parcial de inspiração, não duas escolhas aprovadas**, e ela disse que a ordenação não a ajudou. Não substituímos a avaliação da pessoa pela nota do designer nem calculamos uma métrica de satisfação a partir desta precisão. Ela também havia pedido uma alternativa concreta da peça e recebeu uma nova busca, o que é uma falha de fluxo distinta da ordenação.

São resultados de um caso, com referências externas reais, imagens em baixa resolução, um avaliador e uma persona simulados. Não comprovam qualidade de ranking para pessoas reais, satisfação, licença de uso, generalização ou relação causal entre a ordenação e a peça que veio depois. A comparação usa a ordenação apresentada, que inclui pós-processamento, e não isola o efeito do score Decision API.
