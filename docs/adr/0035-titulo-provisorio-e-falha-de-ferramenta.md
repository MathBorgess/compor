# ADR 0035 — Título provisório explícito e falha de ferramenta inválida

- Estado: recorded
- Data: 09/11/2026
- Fonte: issue #23, revisão do HANDOFF.md e pedido de Matheus para executar as correções da branch `compor/feedback-estudio`.

## Contexto

O contrato de título curto entrou no PR #30 e estava descrito somente no guia de arquitetura. A igualdade entre o nome e o recorte da primeira mensagem confundia origem e texto: editar a ideia impedia a proposta e recusar o nome permitia outra proposta numa sessão futura. Uma ferramenta com mais de 48 caracteres falhava na validação sem encerrar a tentativa, mantendo o projeto ocupado.

## Implementação

O título inicial continua sendo o começo da ideia, normalizado e cortado numa palavra inteira, com até 48 caracteres. `compor_renomear_projeto` recebe no máximo 48 caracteres; o menu e o banco continuam aceitando 200. O servidor não resume nem corta o título sugerido pelo modelo.

O estado local validado mantém `projectTitleProvisional`, separado do texto. Um projeto recém-criado pelo estúdio começa com `true`. Depois da primeira resposta, esse valor permite ao agente propor um nome de campanha. A proposta continua exigindo confirmação. Aceitar ou recusar a proposta encerra essa oportunidade e persiste `false`; renomear pelo menu também o faz, mesmo quando o texto é igual ao título inicial. Editar a ideia antes de enviá-la não altera essa origem. O contexto só permite a iniciativa quando a revisão do projeto recebida do servidor é 1; uma revisão maior demonstra renomeação anterior, mesmo com texto igual. A confirmação do menu aguarda o salvamento local desse estado. O agente pode renomear novamente a pedido explícito da pessoa, mas não por iniciativa própria quando o valor é `false`.

Estados históricos sem o campo recebem `false`, sem inferir permissão pela igualdade de texto. O marcador é local à conta, ao projeto e ao navegador, como o restante da conversa. Não promete sincronização entre dispositivos. Clientes antigos que validam o schema estritamente precisam ser atualizados para ler estados que já contenham o campo.

Uma ferramenta local declarada com argumentos inválidos encerra a tentativa como `failed`, com `invalid_studio_action`, antes de assinar ou encaminhar a ação ao navegador. Consultas posteriores mantêm a falha, sem voltar ao provedor. O projeto pode receber um novo pedido explícito. A interface abandona o vínculo de continuação da sessão falha, preservando a sessão anterior quando o novo pedido foi recusado antes do envio; nenhuma geração ou alteração é repetida automaticamente. Falhas de transporte, vínculos sem prova e efeitos incertos continuam desconhecidos.

## O que substitui

Substitui no [guia de arquitetura](../architecture.md) a comparação do título com a primeira mensagem como critério para a iniciativa do agente. Registra os limites e o campo antes documentados apenas ali. Não muda os contratos de identidade, confirmação, BYOK, título da arte ou persistência no banco.

## Verificação

Contratos cobrem o limite de 48 caracteres, encerramento sem execução, consulta terminal e liberação para novo pedido. Testes de navegador com serviços simulados cobrem ideia editada, confirmação, recusa seguida de recarga e renomeação manual mantendo o mesmo texto. O comportamento do modelo real continua reservado ao teste de Matheus no fim da integração.
