# ADR 0041 — Referências com conversa lateral

- Estado: recorded; implementação local em revisão
- Data: 10/11/2026
- Fonte: pedido de Matheus para que a escolha de referências seja o conteúdo principal, com chat em barra lateral, inspirado na organização de Facebook e Lovable.

## Decisão

Durante a escolha de referências, a conversa participa do layout do estúdio em uma coluna à direita. A galeria conserva a maior parte da largura e sua própria rolagem. Não há menu flutuante nem redimensionador sobre as imagens. A conversa abre visível no desktop e pode ser recolhida para ampliar a galeria.

Até 1000 px, as ações Referências e Conversa alternam as áreas em fluxo, usando a largura disponível, sem sobreposição. Referências é a vista inicial. Na vista Conversa, o contexto e as ações globais cedem espaço ao histórico e ao compositor; continuam acessíveis ao voltar a Referências. O menu do projeto permanece disponível. A altura acompanha também o viewport visual para acomodar o teclado virtual. Conteúdo excepcionalmente alto pode rolar, em vez de ficar cortado.

Galeria e conversa permanecem montadas durante a alternância. Recolher não apaga o texto digitado, as escolhas nem o histórico. Escape recolhe a conversa e devolve o foco ao controle de abertura. Mudanças de largura não deixam o foco em uma área oculta. A preferência de conversa flutuante do editor permanece separada da escolha nesta etapa.

Esta decisão substitui apenas o painel flutuante do [ADR 0023](0023-referencias-e-conversa-flutuante.md) na seleção de referências. A faixa sempre visível do [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md) passa a ter uma exceção na vista compacta Conversa. O editor mantém sua apresentação anterior.

Não altera turnos, geração, pagamentos, consentimento, recuperação, armazenamento de referências ou inclusão de imagens no contexto do agente. Alternar as duas vistas compactas não é sair da etapa de referências e não cria uma nova autorização de geração.

## Verificação e limites

O teste `studio-reference-workspace-browser.test.mjs` cobre geometria de colunas, rolagens independentes, seleção, rascunho, alternância repetida, retorno ao editor, Escape, foco em mudanças de largura, contexto real expandido e redução independente do viewport visual. Ele não substitui testes em teclados e leitores de tela reais.

Nesta implementação local, lint, tipos, build e 56 contratos focados passaram. A execução de navegador ficou bloqueada antes de abrir a página: Chromium aborta ao criar seu socket interno (`EPERM`), inclusive na execução aprovada fora do sandbox. Portanto, geometria, screenshots e qualidade visual ainda não foram confirmadas. Não há evidência de CI, merge ou deploy.
