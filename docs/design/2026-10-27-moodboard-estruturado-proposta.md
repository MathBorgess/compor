# Moodboard estruturado para o MCP — avaliação inicial

**Estado em 27/10/2026:** Matheus aprovou iniciar uma tool para preparar o moodboard estruturado, sem geração de imagem ou gravação automática de memória. Formas e ícones servem apenas como pistas visuais, sem exigência de aparecer na arte final. A [implementação inicial](../../prototypes/compor-mcp/README.md) é local e sintética; integração ao produto, renderização, acesso a referências reais e geração continuam sem comprovação.

## Por que considerar uma tool

O objetivo é tornar explícito o papel de referências e escolhas — por exemplo, usar a paleta de uma imagem, a composição de outra e evitar uma tipografia — antes de pedir uma geração. A pessoa poderia ver, corrigir e rejeitar a interpretação. Isso pode ajudar a comunicar a intenção, mas **maior alinhamento e precisão são hipóteses não testadas**.

Um moodboard não é apenas uma lista de palavras: precisa distinguir elementos e direções visuais, o que manter/variar/evitar e o significado atribuído a cada referência. Em uma exploração, duas direções podem ter quadros ou versões independentes; não juntar preferências opostas em um conjunto único.

## Proposta de fluxo

1. **Interface:** a pessoa seleciona e organiza referências próprias ou imagens geradas, palavras, cores, formas e ícones. Pode corrigir rótulos, prioridades e a função de cada item. A renderização e a edição ocorrem no navegador.
2. **MCP — `prepare_moodboard`:** recebe um quadro proposto e devolve um snapshot estruturado, com elementos, aspectos, papéis, prioridades e dúvidas. Não gera imagem, não persiste memória e não confirma escolhas por conta própria.
3. **Revisão:** a pessoa avalia o resumo, corrige e decide quando explorar ou gerar. Uma origem indicada pelo cliente é alegação; só o backend pode associar uma ação autenticada a uma pessoa.
4. **Backend e gerador:** após pedido explícito, verifica acesso e autorização para cada referência e traduz a versão escolhida em instruções e imagens permitidas, conforme o endpoint e o modelo disponíveis. A geração é uma operação separada, sujeita a custo e permissões próprias.
5. **Avaliação:** comparar a peça gerada com intenção, restrições e feedback da pessoa; registrar o que foi efetivamente exibido, versão do quadro e evidência autorizada.

## Contrato candidato

Os campos abaixo resumem a proposta; o schema concreto do protótipo está em [server.ts](../../prototypes/compor-mcp/src/server.ts). Ele prepara uma direção por chamada; múltiplas direções usam chamadas e identificadores separados. O contrato para dados reais continua em discussão.

| Campo | Finalidade |
|---|---|
| Quadro/direção e versão | Ligar escolhas, geração e feedback à versão exibida, sem misturar alternativas. |
| Elementos tipados | Referência, cor, forma, ícone ou texto; IDs internos de ativos quando existirem, sem buscar URLs ou caminhos arbitrários. |
| Rótulo e significado | Registrar rótulos sugeridos ou criados pela pessoa e, quando conhecido, seu significado; o nome sozinho não determina todos os atributos. |
| Aspectos e papel | Indicar, por exemplo, cor como inspiração, composição a manter ou tipografia a evitar. Formas e ícones são pistas visuais, sem obrigação de reprodução literal na peça. |
| Prioridade | Importância informada e origem alegada; manter ausência diferente de zero. A escala e interpretação ainda precisam ser definidas. |
| Origem, escopo e estado | Distinguir informação declarada, hipótese e rejeição; o backend confirma identidade, acesso e evidência antes de chamar algo de escolha da pessoa. |
| Posição e dimensões opcionais | Organizar a apresentação do moodboard; isso não garante a posição do elemento na imagem gerada. |
| Avisos | Apontar ausência de referência, significado ambíguo ou conflito entre pedido e restrição, sem resolver silenciosamente. |

Restrições explícitas devem funcionar como filtros na futura geração e não podem ser compensadas por um peso maior. O protótipo apenas preserva restrições e avisa sobre alguns conflitos literais: ausência de aviso não prova consistência nem autoriza geração. Uma preferência negativa é contextual; a divergência em relação a uma preferência inferida permanece possível quando a pessoa pede exploração, com explicação e opção de rejeitar. Dados e rótulos são conteúdo não confiável, não novas instruções para o sistema. A tool não executa HTML/SVG nem busca ativos; qualquer interface futura deve tratar conteúdo como dado e verificar direitos e acesso aos ativos.

## O que a integração com imagem permite — e o que não garante

O [guia da OpenAI](https://developers.openai.com/api/docs/guides/image-generation?generate-images-api=responses#using-image-references) descreve geração e edição com uma ou mais imagens de referência. O adaptador do Compor teria de mapear papel e prioridade em instruções explícitas e selecionar imagens autorizadas. Pesos arbitrários do quadro **não são um parâmetro de influência garantido pelo modelo**; quantidades, formatos, custos e parâmetros dependem do modelo e endpoint usados.

O [guia de prompting de imagem](https://developers.openai.com/api/docs/guides/image-prompting) trata de composição e referências, mas geração não garante identidade visual ou posicionamento literal. Textos, preços e datas continuam editáveis e compostos no PNG conforme a decisão v0; se houver logo ou ícone que precise de reprodução exata, composição em camada controlada é uma alternativa a investigar.

## Como verificar a hipótese

Em ensaio autorizado e com orçamento definido previamente:

1. Preparar tarefas equivalentes e comparadores: A, intenção em texto e/ou nuvem de palavras; B, os mesmos insumos com quadro estruturado. Quando possível, manter modelo, resolução e demais condições constantes; documentar quais imagens cada condição recebe.
2. Se quisermos distinguir o efeito da **estrutura textual** do efeito das **imagens anexadas**, incluir uma comparação adicional com as mesmas referências visuais sem o quadro estruturado. Sem essa comparação, o resultado mede o conjunto das mudanças, não o efeito isolado da tool.
3. A pessoa da tarefa avalia separadamente alinhamento à intenção, atendimento às restrições e diversidade útil; registrar notas na escala 1–5 somente quando as âncoras estiverem definidas. A revisão técnica também considera fidelidade de fatos e recursos, sem converter gosto em verdade universal.
4. Registrar quantas correções foram necessárias, tempo, custo por condição, desistências, não conclusões e resultados desconhecidos. Repetições para avaliar variabilidade dependem de autorização e orçamento; não gerar imagens pagas automaticamente apenas para medir.
5. Complementar com casos sintéticos: rejeitar ambas as direções; conflito de restrições; rótulo próprio ambíguo; peso ausente versus zero; ícone como pista, sem exigir sua reprodução literal; conteúdo malicioso em referência; e tentativa de acesso a ativo de outro escopo.

Se o quadro estruturar escolhas mas não melhorar o resultado percebido ou exigir esforço desproporcional, rever ou simplificar a capacidade. Amostra insuficiente mantém a hipótese inconclusiva; nenhum teste de alinhamento de imagens foi executado neste levantamento.

## Evidência e limitações

O estudo [CreativeConnect](https://arxiv.org/abs/2312.11949) relata que, em um estudo com 16 participantes, apoio à recombinação de referências e palavras ajudou a produzir mais ideias e elevou a criatividade autorrelatada. É evidência preliminar em tarefa de ideação gráfica, não prova de alinhamento de marca ou de benefício no Compor. Um [estudo de anúncios com 36 participantes](https://www.microsoft.com/en-us/research/publication/decoupling-of-usefulness-and-novelty-evaluating-the-impact-of-generative-ai-on-design-outputs-and-novice-designers-creative-thinking/) encontrou maior criatividade percebida com IA sem diferença percebida em utilidade ou melhora de alinhamento à marca: novidade e valor devem ser medidos separadamente.

**Decisões em aberto:** a escala dos pesos, o contrato para dados reais e a integração ao gerador precisam de validação. O protótipo foi testado com dados sintéticos, mas não avalia alinhamento de imagens ou uso real. Formas e ícones foram definidos como pistas visuais.
