# ADR 0019 — Phoenix determinístico no bundle web

- Data: 06/11/2026
- Estado: recorded
- Fonte: pedido de Matheus para integrar o PR #17 com as decisões deste chat e corrigir seus comentários de review.

## Problema e decisão

O PR #17 adicionava `/api/studio/decision`, um subprocesso que importava o servidor stdio do protótipo, artefatos `dist`, skills locais e o benchmark de calibração. O bundle de deploy não incluía essas dependências. A rota também não verificava sessão, origem, propriedade do projeto nem tamanho do corpo. Compilar o checkout completo não provava que a função publicada executaria.

A web recebe um módulo TS puro em `apps/web/lib/phoenix`. Ele adapta somente catálogo, schemas, fórmulas e funções determinísticas do Phoenix. `phoenix-worker.ts` passa a ser uma fachada importada diretamente pelo handler, sem subprocesso, filesystem, cliente de modelos, API key ou servidor MCP. Não é um novo loop de agente; o estúdio continua usando a Agents API gerenciada descrita no ADR 0016.

O módulo fica no app porque atende a exploração auxiliar do estúdio. O protótipo conserva sua implementação e seus hashes históricos. Se outra aplicação precisar dessa fronteira reduzida, a extração para pacote compartilhado deverá migrar consumidores e manter a mesma proveniência; esta decisão não publica o stdio como backend multiusuário.

## Contratos e autoridade

`POST /api/studio/decision` valida origem, sessão verificada, JSON estrito, corpo de até 8 KiB, decisão conhecida e UUID do projeto. Verifica propriedade usando o token da pessoa antes do cálculo. Erros não retornam stderr, caminhos ou detalhes de serviços. A resposta usa `Cache-Control: no-store`; a função possui duração máxima configurada. Dados e parâmetros de calibração não são aceitos arbitrariamente do navegador.

O cálculo usa defaults fixos e no máximo quatro alocações de catálogo. Não recupera imagens, consulta fontes externas, chama modelos, aprende gostos da pessoa ou mede audiência. As sugestões e scores são identificados como `deterministic_mock`, `compor_phoenix_static` e `synthetic_simulation_not_human_evaluation`. O contrato `referenceSummary` distingue catálogo sintético de referência visual real; o browser valida-o sem importar o runtime do servidor.

O benchmark sintético de NDCG/recall permanece em experimentos; executá-lo a cada clique não demonstraria qualidade para aquele criador. A arte completa continua sendo produzida pela rota de imagem com confirmação da operação concreta. Não se adicionam camadas de título, preço ou data. A metodologia Agile Deliberation permanece no pacote próprio, com exemplos/contraexemplos, critérios e decisão humana descritos nos ADRs 0012–0013.

## Proveniência e verificação

[PROVENANCE.md](../../apps/web/lib/phoenix/PROVENANCE.md) e `source-manifest.json` identificam origem, commit, hashes e mudanças. O gate de staging exige a presença das dependências e da proveniência; o build não depende de uma compilação condicional do protótipo.

Testes cobrem autenticação, origem, autorização por projeto, corpo limitado, schema estrito, rótulos sintéticos, paridade do cálculo e execução de um bundle isolado sem arquivos do protótipo. Esses testes não provam resultado em produção nem validação com público real; deploy e smoke devem ser registrados separadamente para o commit publicado.

Esta decisão complementa os ADRs 0010, 0014, 0015 e 0017. Não altera o status histórico do ADR 0011 nem concede autoridade de publicação ao MCP.
