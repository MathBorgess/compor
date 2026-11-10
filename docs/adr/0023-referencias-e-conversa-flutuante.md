# ADR 0023 — Referências e conversa flutuante

- Estado: accepted
- Data: 06/11/2026
- Fonte: revisão de Matheus da interface local neste chat.

> Em 10/11/2026, o [ADR 0041](0041-referencias-com-conversa-lateral.md) registra a substituição do painel flutuante por conversa lateral na etapa de escolha de referências. O editor conserva o comportamento descrito abaixo.

> Em 09/11/2026, o [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) substituiu o recolhimento do contexto do pedido por uma faixa sempre visível. Conexão e controles de exploração continuam recolhidos.

## Decisão

Referências do Pinterest aparecem antes das imagens exploratórias na área principal. A própria imagem permite selecioná-la para a conversa e a Direção; isso não é aceitação estética. O feedback e as decisões são expressos na conversa, sem avaliações ou comentários nos cartões. As imagens do lote recente aparecem primeiro; anteriores continuam recuperáveis, identificadas por ordinal estável.

A conversa fica em um painel flutuante recolhível que não desloca o quadro; o painel preserva o texto digitado ao ser recolhido e pode ser fechado com Escape. Apenas o histórico rola; o campo e o envio ficam fixos. O conteúdo principal reserva espaço para o controle de abertura e o painel respeita o viewport.

Conexão, contexto e controle de exploração ficam recolhidos para dar espaço à conversa. Uma tentativa incerta mantém aviso e ação de consulta acessíveis. A inspeção técnica de um turno concluído é uma opção local de desenvolvimento, habilitada somente por `COMPOR_DEVELOPER_MODE=true` em `NODE_ENV=development`.

Esta decisão substitui a hierarquia que dava à conversa uma coluna principal no briefing e o chat lateral fixo descrito no ADR 0020. Não altera autorização, reservas, geração, decisões criativas ou tratamento de resultados incertos dos ADRs 0012 e 0021.

## Verificação

Testes de navegador exercitam abertura, fechamento, foco, preservação de rascunho e limites em telas grandes e estreitas. Os resultados devem ser registrados por execução; eles não demonstram uso real, acessibilidade completa nem comportamento de todos os teclados virtuais.
