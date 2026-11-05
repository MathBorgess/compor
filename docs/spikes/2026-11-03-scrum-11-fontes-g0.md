# SCRUM-11 — fontes e limites de G0

**Consulta documental:** 03/11/2026. Naquela consulta ainda não havia chamada real ou prova de integração. Posteriormente, na mesma data, o agente realizou a [prova sintética autorizada](2026-11-03-validacao-sintetica-openai.md) com Agents API e Images API; ela não comprova integração do Compor. O estado atual da [tarefa SCRUM-11](https://compor-mathai.atlassian.net/browse/SCRUM-11) deve ser conferido no Jira. As condições comerciais continuam exigindo esclarecimento.

## Evidência técnica

| Tema | O que a fonte demonstra | Ainda não demonstrado |
| --- | --- | --- |
| Agents API | O [quickstart oficial](https://developers.openai.com/api/docs/guides/agents-api/quickstart) requer chave do projeto com `api.agents.read`, `api.agents.write` e `api.responses.write`; a API usa cabeçalho beta. Na prova posterior, uma sessão sintética com a chave de teste concluiu um turno. | Disponibilidade para outras contas e configurações; execução do Compor. |
| MCP remoto | A [documentação de conexões MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp) descreve conexão HTTP a partir do serviço OpenAI e credencial de transporte por sessão. | Autenticação, isolamento, descoberta e chamada do servidor Compor implantado. |
| Imagem via API | A [documentação de imagens](https://developers.openai.com/api/docs/guides/image-generation) descreve geração/edição via Images API e observa que uso de modelos GPT Image pode exigir verificação da organização. A prova posterior gerou uma imagem sintética Flare em qualidade `low`. | Disponibilidade e cota em outras contas; qualidade `auto` e function tool conectada ao Compor; faturamento efetivo. |
| Imagem no Codex | O [guia de geração de imagens](https://learn.chatgpt.com/docs/image-generation) documenta uso interativo de `imagegen` e indica limites de uso do Codex. | Disponibilidade no Codex Desktop usado pelo Compor; transferência autorizada do arquivo ao projeto compartilhado; equivalência dessa capacidade na Agents API. |
| Limites e cobrança | A [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) aponta preços do modelo, tools e eventual sandbox; [limites](https://developers.openai.com/api/docs/guides/rate-limits) variam por organização, projeto e modelo. Matheus autorizou até US$ 5 para a prova; a imagem teve custo estimado, não faturamento confirmado. | Uso e custo do turno de agente, faturamento total e custo por peça. |

## Condições comerciais a esclarecer

O [OpenAI Services Agreement, §§2.2 e 3.3](https://openai.com/policies/services-agreement/) descreve integração da API em aplicações para usuários finais e restringe compra, venda ou transferência de chaves entre terceiros. Esses trechos, isoladamente, **não demonstram** se o fluxo proposto de a pessoa entregar temporariamente sua própria chave ao backend operado pelo Compor é permitido ou proibido sob os termos aplicáveis. A distinção entre uso da API numa aplicação e o tratamento de uma chave BYOK exige verificação específica antes de considerar a rota comercial elegível; não usar chave de outro aplicativo ou proxy como contorno.

Também é necessário verificar o acordo aplicável à conta, preços, quotas e condições dos serviços externos escolhidos. Esta nota não substitui a decisão de G0 nem representa parecer jurídico ou autorização de oferta.

## Provas e decisões ainda necessárias

1. Preservar o [registro da prova sintética](2026-11-03-validacao-sintetica-openai.md), inclusive custo total desconhecido. A autorização de até US$ 5 não autoriza deploy nem gasto ilimitado.
2. Demonstrar a conexão Codex Desktop ao MCP do Compor, uso de imagem sem a chave da sessão web e persistência autorizada do artefato; documentar falhas em vez de inferir equivalência a partir de documentação genérica.
3. Confirmar condições para a oferta específica e resolver a dúvida de BYOK com fonte ou orientação aplicável. Só então avaliar os critérios de SCRUM-11; simulações, provas isoladas e testes locais não encerram G0.
