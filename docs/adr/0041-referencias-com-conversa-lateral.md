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

### Revalidação posterior (10/11/2026)

O parágrafo anterior descreve a primeira implementação local. O [Quality 65](https://github.com/MathBorgess/compor/actions/runs/42845658780), no head `2347547ad02dd987a93241fc68dc56d1d4d1da2d`, foi cancelado na tentativa 1. O job web excedeu 20 minutos após uma falha no teste isolado de PersonaStep, sem resumo final, e nenhuma causa foi atribuída. A tentativa 2, no mesmo SHA e sem mudança de código, aprovou o Quality gate com 374/374 testes web e zero skips. As capturas sintéticas da sidebar foram inspecionadas.

Na revisão seguinte do PR 48, o Chromium abriu normalmente num macOS local, e a suíte de navegador foi executada fora do CI. O resultado está no [relatório da revisão](../quality/studio-quick-replies-2026-11-10.md). Esta decisão de layout não mudou. A bandeja de seleção e as respostas rápidas estão no [ADR 0042](0042-leitura-estruturada-e-respostas-rapidas.md). Teclados virtuais e leitores de tela reais continuam sem validação.

### Correção de foco na mudança rápida de largura (10/11/2026)

A suíte local revelou uma falha intermitente no foco ao reduzir a largura. Com o foco em “Salvar versão” ou no campo Oferta, o foco podia terminar no `body` em vez de em “Abrir conversa”. Foram dois mecanismos:

- Duas mudanças de breakpoint caíam no mesmo lote do React. O estado final não mudava, e o efeito de foco não rodava.
- O CSS da nova largura escondia o controle antes do listener da media query, que então só via o `body`.

O shell agora conta cada mudança de breakpoint e lembra o último foco dentro dele. Esse foco só é usado quando o foco atual está no `body`, e só move o foco a partir das áreas que a vista compacta de conversa oculta. A regra de respeitar um foco novo continua.

Correções no teste:

- esperar o foco de abertura da conversa antes de redimensionar;
- esperar o layout compacto antes de conferir a ocultação.

Nenhuma asserção foi removida, e os timeouts ficaram iguais. Com o teste sincronizado, o shell anterior falhou em 27 de 30 rodadas locais. Sem o fallback do último foco, falhou em 16 de 20. Com as duas partes, passou em 30 de 30. Isso não substitui o teste com teclados e leitores de tela reais.
