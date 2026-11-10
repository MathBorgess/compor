# ADR 0020 — Layout do PR 17 com conversa adaptativa

- Estado: accepted
- Data: 06/11/2026
- Fonte: decisão de Matheus neste chat de integrar as decisões anteriores com o [PR 17](https://github.com/MathBorgess/compor/pull/17), na main e em produção.

> Em 09/11/2026, o [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) passou fatos e direção para uma faixa sempre visível no estúdio. Os painéis sobre o quadro continuam para os detalhes da persona e os critérios.

## Contexto

O PR 17 introduziu o layout B/C, menu de projetos, painéis Bases/Marca e cartões de exploração. Sua entrevista anterior à criação precisa coexistir com a entrada direta na conversa e a deliberação adaptativa aceita no ADR 0012. Migrar o PR sem conciliação também restauraria arquivos JavaScript no app Next e um runtime Phoenix fora do bundle de publicação.

## Decisão

Preservar a composição visual do PR: chat à esquerda com 380 px no layout B, recolhido no C, menu de projetos no topo, painéis sobre o quadro e visualização da arte. Manter os ativos, cores e tipografia, com comportamento responsivo e Escape restaurando o foco.

O Google conduz à conversa. O briefing aparece progressivamente no quadro. A exploração por cartões é opcional e pode ser encerrada antes de todas as respostas. Campos já conhecidos não são perguntados novamente; detalhes opcionais não formam uma fila obrigatória. Exemplos estáticos são identificados como esboços ilustrativos. Eles não representam pesquisa externa, imagem gerada ou evidência sobre uma audiência.

Os critérios visuais e de mensagem continuam na deliberação do agente e no painel Marca, com exemplos/contraexemplos, origem e decisão humana. Criador e destinatário permanecem perspectivas distintas. Se houver tensão entre elas, o criador decide; a persona simulada continua uma hipótese.

Textos literais podem ser definidos explicitamente para orientar o motor. A oferta e as opções de exploração não viram automaticamente um título na arte. O GPT Image gera a imagem inteira, inclusive os textos. Ajustes produzem versões e a legenda pode ser copiada separadamente. A confirmação concreta da geração paga permanece necessária.

O frontend e a rota de exploração usam TS/TSX estrito. O [ADR 0019](0019-phoenix-deterministico-no-bundle-web.md) delimita o módulo Phoenix determinístico incluído no bundle, separado do runtime gerenciado da Agents API e do servidor MCP stdio.

## Consistência e verificação

Renomear pelo chat e pelo menu usa o mesmo handler. A resposta validada atualiza o projeto aberto e a lista do componente pai, incluindo a revisão usada na próxima alteração. Trocar de projeto aguarda a persistência das mudanças locais.

Os testes verificam o layout B/C, foco/teclado, abertura e saída da exploração, reaproveitamento do briefing, preservação de versões e uma segunda renomeação após trocar de projeto. Build, gates e publicação são evidências separadas: este ADR não declara um deploy concluído. A verificação de produção deve identificar commit e deployment, sem atribuir testes sintéticos a usuários reais.

O ADR 0012 continua vigente. Esta decisão substitui apenas o fluxo obrigatório de entrevista proposto no PR 17; preserva sua direção visual. O ADR 0014 continua exigindo TypeScript estrito.
