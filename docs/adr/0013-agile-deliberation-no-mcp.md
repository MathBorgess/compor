# ADR 0013: Agile Deliberation no MCP

Estado aceito para implementação em 05/11/2026, por solicitação explícita de Matheus nesta conversa. A incorporação de código e o registro arquitetural foram pedidos após a decisão sobre deliberação adaptativa do [ADR 0012](0012-arte-integral-e-deliberacao-adaptativa.md).

## Problema

“Acolhedor”, “sofisticado” ou “claro” podem significar coisas diferentes para o criador e para quem recebe o post. O Compor precisa transformar essas ambiguidades em comparações revisáveis, sem apresentar uma simulação de persona como evidência de público real nem impor uma entrevista antes de gerar.

## Decisão

Copiar uma seleção identificada do código Apache 2.0 do Google Research e manter um pacote compartilhado de adaptação. `@compor/agile-deliberation` organiza definições, sinais necessários, positivos e negativos, escolhe uma ambiguidade declarada ainda aberta e compara uma revisão proposta com o critério anterior. Os clientes fornecem exemplos e contraexemplos autorizados. Um caso de fronteira pode complementar a comparação.

`prepare_deliberation` e `propose_criterion_refinement` são ferramentas puras no MCP remoto autenticado e no protótipo stdio. As chamadas não consultam provedores, classificam imagens, geram arte ou persistem preferências. O histórico recebido é rotulado como reportado pelo cliente. A confirmação permanece no cliente humano e preserva versões anteriores. A ausência de histórico não permite inferir aceitação.

O pacote exporta instruções de metodologia para o agente web consumir a mesma adaptação. As extensões criador/destinatário e visual/mensagem são do Compor. Uma tensão explícita propõe comparação e deixa a decisão com o criador. A cobertura dessas dimensões é informativa, sem obrigar quatro perguntas em todo post.

## Alternativas e escolha

Executar o notebook Python como serviço conservaria mais do experimento original, mas adicionaria Gemini, CLIP, PyTorch, FAISS e indexação de imagens. Esse caminho introduziria outro provedor e operações externas sem necessidade para o fluxo autorizado.

Copiar somente instruções para cada MCP seria menor inicialmente, mas duplicaria o comportamento e perderia a ligação verificável com o código. O pacote compartilhado mantém os métodos portados e as instruções adaptadas no mesmo lugar, sem dependência de pesquisa no runtime. As bibliotecas Zod e MCP já são usadas pelos dois clientes.

## Consequências e limites

O produto incorpora uma parte identificada do método, não o classificador nem o experimento completo. A adaptação não mede a qualidade do post ou a conversão. A seleção da próxima ambiguidade usa a ordem fornecida pelo cliente, sem ranking aprendido. Nenhuma alegação de que a instrução proposta é seguida pelo modelo decorre apenas da existência do pacote.

O contexto aceita até 16 critérios, 100 decisões reportadas e 48 KiB antes da análise. A fronteira HTTP mantém autenticação e seu limite de requisição. O MCP não lê automaticamente os critérios locais da web; cada cliente transmite somente o contexto autorizado disponível para a tarefa.

O [mapa de incorporação](../agile-deliberation.md) registra origem, módulos, contratos e verificação. O [manifesto](../../third_party/google-research/agile_deliberation/provenance.json) permite detectar alteração das cópias originais.
