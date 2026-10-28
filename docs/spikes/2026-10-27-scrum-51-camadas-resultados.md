# Spike SCRUM-51 — resultados sintéticos

**Experimento local em 27/10/2026.** [Plano prévio](2026-10-27-scrum-51-camadas-plano.md) · [Proposta](../design/2026-10-27-scrum-51-annotate-proposta.md) · [Código e prévias](../../prototypes/compor-mcp/spike-layers/README.md). Não houve usuários, modelo, chaves, rede, armazenamento de produto ou gastos de IA.

## O que foi observado

- **Peça em camadas:** `prepare_layered_creative` recebeu um plano sintético de oito camadas pelo MCP em memória e devolveu o snapshot. Um renderer Pillow separado compôs a peça a partir desse retorno. As ferramentas MCP não geram as imagens nem escolhem o conteúdo criativo: o conteúdo e o layout foram informados pela fixture.
- **Preço:** para uma segunda versão, o experimento modificou manualmente o tamanho da fonte e preservou `R$ 99`; as outras sete especificações e os pixels de suas camadas permaneceram iguais. A alteração na composição ficou dentro da união dos pixels da camada de preço. Não houve interpretação automática da frase ou alteração acionada pela anotação.
- **Área:** testes do protocolo preservaram um retângulo e retornaram camadas que intersectam sua caixa, incluindo fundo e preço no caso de sobreposição. Isso é uma lista geométrica de candidatas, não seleção semântica nem recorte de imagem enviado ao modelo.
- **Lote:** o teste MCP registra “gostei da paleta” e “não gosto desta fonte” em camadas diferentes, preservando as notas e os escopos alegados; não altera memória nem confere autoria, permissões ou escopos. O MCP não classifica o sentimento.
- **Erros:** são rejeitados camada inexistente, IDs duplicados, regiões fora da imagem e diferença entre versão da anotação e versão do snapshot fornecido. Essa última comparação não verifica a versão atual no banco.

A prévia [antes](../../prototypes/compor-mcp/spike-layers/output/antes.png) e [depois](../../prototypes/compor-mcp/spike-layers/output/depois.png) e o [resultado JSON](../../prototypes/compor-mcp/spike-layers/output/resultado.json) são fictícios e reproduzíveis pelo script. O ensaio não separa automaticamente elementos de um bitmap nem garante editor ou exportação do produto.

## Como a crítica poderá influenciar contexto — desenho, não implementação

Alvo da alteração, alcance da alteração e escopo de uma hipótese de preferência são dimensões diferentes. Para “não gosto desta fonte”:

| Dimensão | Impacto candidato | Limite |
|---|---|---|
| Camada | Preservar o ID e a versão da fonte criticada; sugerir alternativa naquela camada. | O teste não interpretou a frase nem aplicou a sugestão. |
| Peça | Usar a crítica para orientar esta peça quando apropriado. | Rejeitar uma fonte não rejeita automaticamente a peça inteira. |
| Variação | Associar a evidência à variação exibida; comparar novas alternativas. | Não copiar a crítica a outras variações sem relação ou confirmação. |
| Campanha / tarefa | Criar hipótese reversível com origem e evidência, quando a observação apoiar a reutilização contextual. | Não substituir preferência confirmada; duas rejeições distintas do mesmo aspecto e escopo são hipótese inicial de recorrência, não regra validada. |
| Produto | Conforme decisão de 28/10/2026, ampliar preferência inferida ao produto exige confirmação da pessoa. | Não há propagação automática a produto, marca ou organização; a checagem e persistência dessa confirmação ainda não estão implementadas. |

Feedback positivo pode orientar a exploração dentro do seu contexto, assim como feedback negativo, sem inferir conclusão da tarefa. Dados para avaliação/curadoria e conteúdo em traces dependem das permissões específicas já acordadas. O protótipo não salva preferência ou evento e, portanto, não prova isolamento ou evolução de memória em nenhum escopo.

## Ainda precisa de prova

O spike não exercitou geração por IA em camadas, transparência real, inpainting, visualização no navegador, autorização, Supabase, reconstrução a partir de PNG, precisão de recortes, leitura multimodal, interpretação pelo agente ou aprendizado com pessoas. Tampouco comprova o impacto do Annotate em alinhamento, tempo ou resultado comercial. Necessários: protótipo de integração com os limites de consentimento e custo, critérios para escopo de memória e comparação autorizada contra a interação sem marcação. A atividade permanece em andamento e requer revisão de Matheus.
