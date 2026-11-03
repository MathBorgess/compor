# Adaptador isolado da Images API

`createImageHandler` recebe um autenticador fornecido pelo servidor e trata requisição HTTP `POST` com `apiKey`, `prompt` e `authorizeGeneration: true`. A chave existe somente durante a requisição; o adaptador não a escreve em disco, banco ou logs. A resposta contém PNG em base64, não é cacheada e não representa aceite ou publicação. A instrução pede uma imagem sem texto, mas a saída precisa de revisão humana.

A chamada usa `gpt-image-1`, tamanho `1024x1024`, qualidade `low`, PNG e uma imagem. Limites de 16 KiB na requisição e 12 MiB na resposta do provedor protegem o processo. Quando informados e válidos, os contadores `input_tokens`, `output_tokens` e `total_tokens` são retornados; uso ausente ou incompleto é `null`, não zero, e não equivale a valor faturado. A saída é verificada pelo prefixo de assinatura PNG, não por uma decodificação completa.

Falhas após envio, incluindo timeout, erro do provedor ou resposta inválida/maior que o limite, retornam `generation_result_unknown`; a imagem pode ter sido gerada ou cobrada e não há nova tentativa automática. Uma credencial explicitamente recusada retorna 401 ou 403. Os testes usam somente um provedor simulado e não custam dinheiro:

```sh
npm test
```

**Ainda não conectar à aplicação nem publicar.** Falta amarrar a autorização explícita e cada tentativa ao usuário, projeto e versão; persistir e recuperar o estado incerto; garantir autorização por operação e isolamento real; integrar o resultado ao Storage privado e ao fluxo do agente; medir custo estimado; verificar limites reais de implantação; e validar ponta a ponta com credenciais, autorização de gasto e infraestrutura apropriadas. O booleano recebido neste recorte não substitui nenhuma dessas verificações. O adaptador ainda não oferece cancelamento/reconciliação nem idempotência durável.
