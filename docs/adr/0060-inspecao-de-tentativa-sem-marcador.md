# ADR 0060 — Inspeção de tentativa sem marcador local

- Estado: implementado localmente; publicação não verificada.
- Data: 17/11/2026.
- Fonte: recuperação de uma tentativa pendente quando a aba não tem o marcador de sessão.

## Decisão

A operação explícita `inspect_pending` da rota de chat consulta o estado de uma tentativa sem executar seu resultado. Ela exige origem, identidade, propriedade do projeto e correspondência do pedido, além de prova de recuperação assinada para a mesma conta, projeto, tentativa e conversa. Essa prova deve ser vinculada à fonte e à credencial efetiva: chave trocada, outra fonte, prova inválida e provas BYOK históricas sem esse vínculo retornam `unknown` sem consultar o provedor. Os fluxos históricos de recuperação continuam aceitando suas provas anteriores conforme o ADR 0038.

Para registro ainda não terminal, a consulta pode fazer GET da sessão comprovada e dos turnos, identifica o turno raiz por ID persistido ou pelo único candidato inequívoco, e não lê itens. Ela devolve apenas `status` (`running`, `action_required`, `completed`, `failed` ou `unknown`) e `retryAutomatically: false`. Um turno observado `failed` com código exato `usage_limit_exceeded` pode acrescentar `error: "provider_usage_limit"`. O resultado não inclui conteúdo de mensagem, prompt, argumentos, IDs adicionais ou provas de ação. Falha de verificação, ambiguidade, timeout ou indisponibilidade permanecem `unknown`.

A operação não reserva, altera estado, encerra tentativa, registra medição, envia eventos ou executa ações e imagens. Consultas simultâneas são leituras independentes. O resultado é uma observação pontual, sem garantia de disponibilidade posterior nem prova de execução de ferramentas. Para um registro já `failed`, retorna falha genérica sem consultar o provedor, preservando o [ADR 0035](0035-titulo-provisorio-e-falha-de-ferramenta.md): o estado persistido não distingue falha de ação inválida das demais.

O poll normal e a compatibilidade histórica não são alterados. Uma inspeção não autoriza reenviar a mensagem ou uma imagem e não resolve, por si só, o estado local. Não há mudança de persistência ou migração.

## Verificação

Testes simulados cobrem estados de turno, ações pendentes, limite exato, resposta sanitizada, chamadas GET, ausência de mutações, concorrência, prova e escopos incorretos, troca de chave e fonte, provas legadas, falhas do provedor e terminal `failed`. Não demonstram comportamento, disponibilidade nem faturamento do provedor real.
