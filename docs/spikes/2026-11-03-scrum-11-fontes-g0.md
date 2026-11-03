# SCRUM-11 — fontes e limites de G0

**Consulta:** 03/11/2026. Pesquisa documental; não houve chamada à API, verificação de acesso à conta, deploy ou prova da integração do Compor. G0 permanece aberto. A [tarefa SCRUM-11](https://compor-mathai.atlassian.net/browse/SCRUM-11) exige, além de fontes aplicáveis, prova sintética autorizada e esclarecimento das condições comerciais.

## Evidência técnica

| Tema | O que a fonte demonstra | Ainda não demonstrado |
| --- | --- | --- |
| Agents API | O [quickstart oficial](https://developers.openai.com/api/docs/guides/agents-api/quickstart) requer chave do projeto com `api.agents.read`, `api.agents.write` e `api.responses.write`; a API usa cabeçalho beta. | Disponibilidade da API, do modelo e das permissões na conta da pessoa; execução do Compor. |
| MCP remoto | A [documentação de conexões MCP](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp) descreve conexão HTTP a partir do serviço OpenAI e credencial de transporte por sessão. | Autenticação, isolamento, descoberta e chamada do servidor Compor implantado. |
| Imagem via API | A [documentação de imagens](https://developers.openai.com/api/docs/guides/image-generation) descreve geração/edição via Images API e observa que uso de modelos GPT Image pode exigir verificação da organização. | Permissão, cota, modelo e custo efetivos com a chave selecionada; function tool conectada ao Compor. |
| Imagem no Codex | O [guia de geração de imagens](https://learn.chatgpt.com/docs/image-generation) documenta uso interativo de `imagegen` e indica limites de uso do Codex. | Disponibilidade no Codex Desktop usado pelo Compor; transferência autorizada do arquivo ao projeto compartilhado; equivalência dessa capacidade na Agents API. |
| Limites e cobrança | A [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) aponta preços do modelo, tools e eventual sandbox; [limites](https://developers.openai.com/api/docs/guides/rate-limits) variam por organização, projeto e modelo. | Valores, cota, faturamento e limite de gasto da conta escolhida; custo por peça. |

## Condições comerciais a esclarecer

O [OpenAI Services Agreement, §§2.2 e 3.3](https://openai.com/policies/services-agreement/) descreve integração da API em aplicações para usuários finais e restringe compra, venda ou transferência de chaves entre terceiros. Esses trechos, isoladamente, **não demonstram** se o fluxo proposto de a pessoa entregar temporariamente sua própria chave ao backend operado pelo Compor é permitido ou proibido sob os termos aplicáveis. A distinção entre uso da API numa aplicação e o tratamento de uma chave BYOK exige verificação específica antes de considerar a rota comercial elegível; não usar chave de outro aplicativo ou proxy como contorno.

Também é necessário verificar o acordo aplicável à conta, preços, quotas e condições dos serviços externos escolhidos. Esta nota não substitui a decisão de G0 nem representa parecer jurídico ou autorização de oferta.

## Prova ainda necessária

1. Matheus autorizou até US$ 5 no total para provas reais da Agents API e geração de imagem. Identificar a chave autorizada e verificar as permissões antes do ensaio; não registrar credenciais nem tratar essa autorização como liberação de deploy ou de gasto ilimitado.
2. Executar uma chamada sintética autorizada da rota Agents API e, separadamente, a geração de imagem necessária; registrar apenas ambiente, versões, autorização, resultados e uso/custo disponíveis, sem dados reais ou segredos.
3. Demonstrar a conexão Codex Desktop ao MCP do Compor, uso de imagem sem a chave da sessão web e persistência autorizada do artefato; documentar falhas em vez de inferir equivalência a partir de documentação genérica.
4. Confirmar condições para a oferta específica e resolver a dúvida de BYOK com fonte ou orientação aplicável. Só então avaliar os critérios de SCRUM-11; simulações e testes locais não encerram G0.
