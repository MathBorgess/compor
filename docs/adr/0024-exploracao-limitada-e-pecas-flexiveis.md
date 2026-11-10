# ADR 0024 — Exploração limitada, fontes indicadas e campos da peça

- Estado: accepted
- Data: 06/11/2026
- Fonte: validação local conduzida com Matheus no chat Codex em 06/11/2026.

> Em 09/11/2026, o [ADR 0029](0029-agente-opinativo-e-pergunta-unica.md) determinou que a exploração espera a resposta da pessoa depois da pergunta do turno de seleção. O limite de duas rodadas sem interação continua valendo nos demais casos.

## Decisão

A exploração visual fica ativa somente na tela de referências. Gera três imagens sequenciais por lote e, enquanto houver um próximo lote permitido, apresenta a espera de 15 segundos. No máximo duas rodadas completas podem transcorrer sem a pessoa selecionar ou comentar propostas. Ao atingir esse limite, o Compor apresenta a questão no chat e aguarda uma ação explícita para gerar mais; não reinicia apenas porque a pessoa fechou ou reabriu a tela. Sair da exploração interrompe novas solicitações. Uma operação já enviada pode concluir, e um resultado incerto não permite repetição automática. A pausa e a saída não eliminam resultados anteriores.

Essa decisão substitui a parte da [cadência anterior do ADR 0021](0021-exploracao-visual-autonoma.md) que previa lotes indefinidos enquanto a sessão estivesse ativa. A conexão da chave continua autorizando geração guiada, sem confirmação individual por imagem; o limite de interação não é um teto de gasto nem comprova o custo final.

O chat aceita links indicados pela pessoa e pode usar o conteúdo acessível para responder. O leitor implementado considera até três endereços explícitos do turno, apenas HTTPS público, e lê HTML ou texto simples com limites de tamanho e tempo. Não envia cookies ou chave ao site, bloqueia endereços de rede não públicos e restringe redirecionamentos à mesma origem. Conteúdo externo é dado não confiável; a leitura não concede às páginas autoridade de ação. A resposta desse turno não possui ferramentas de alteração ou geração. Páginas privadas, conteúdo dependente de JavaScript, outros tipos de arquivo ou origens não suportadas podem não ser lidos. O comportamento ainda exige validação com fontes reais representativas.

Os textos de uma peça podem incluir campos próprios da proposta, em vez de impor preço e data a todas as criações. A IA pode acrescentar rótulos vazios quando forem úteis; não inventa os valores ausentes. A pessoa pode criar, preencher ou remover campos. Versões legadas continuam legíveis; novas versões podem conter uma lista opcional e validada de até 20 campos, com identificador, rótulo, valor e origem. A lista também integra o pacote e o vínculo da geração para que uma alteração não passe despercebida. Clientes que validam estritamente o formato antigo precisam ser atualizados antes de consumir versões que contenham novos campos.

A resposta de salvamento real contém metadados de aprovação; o frontend os normaliza antes de atualizar o estado. Num conflito, consulta o histórico e só recupera automaticamente uma versão imediatamente seguinte quando a base e o conteúdo coincidem com o que foi submetido. Edições posteriores continuam em um rascunho; havendo divergência, a revisão do histórico permanece necessária. A recuperação não repete geração de imagem.

## Evidência e limites

A correção de formato e os casos de recuperação equivalente e divergente passaram em testes com respostas simuladas; não se deve extrapolar isso para toda causa possível de HTTP 409. Na revisão real local, foi observado um salvamento concluído seguido de conflitos, e a investigação identificou a rejeição dos metadados no parser do frontend. A migração `20261106000021` não altera versões históricas; sua aplicação ao banco de qualquer ambiente e a compatibilidade com clientes externos requerem verificação própria.

Os controles de acesso, reserva durável e interrupção de resultados incertos continuam necessários. Testes com serviços simulados não provam a resposta criativa, a fatura ou o funcionamento em produção. A disponibilidade do MCP em um cliente real deve ser verificada separadamente.
