# ADR 0055 — Configurações do projeto em janela modal

- Estado: decisão solicitada; implementada e validada localmente.
- Data: 16/11/2026.
- Fonte: pedido explícito na revisão de usabilidade local para manter o modal do ADR 0053, mas abri-lo como janela sobre a tela de base em vez de cobrir todo o viewport; Referências deste post foi incluído depois, também por pedido explícito.

## Decisão

Configurações do projeto continua sendo um diálogo modal com as mesmas abas (Contexto, IA, Referências, Marca e direção, Materiais e versões e Histórico anterior), conteúdo rolável e saída visível. Em vez de ocupar todo o viewport, abre como janela centralizada com borda, cantos arredondados e sombra. O estúdio de base — barra superior, menu lateral e conteúdo — permanece visível nas margens, sob o fundo do diálogo, e continua inerte enquanto o modal está aberto.

Em telas largas a janela deixa 32px de margem, com limite de 1180×880px. Até 600px de largura, a margem é de 12px. Com até 520px de altura, a janela volta a ocupar o viewport, para que a conversa e o retorno das referências continuem visíveis. A aba Referências aberta a partir das configurações do projeto segue a mesma janela.

Dentro da janela, o conteúdo das abas acompanha o modal: as opções de IA mantêm a aparência de cartão (texto escuro sobre fundo branco; destaque azul-claro quando escolhida), em vez do estilo genérico de botão do modal, que as deixava ilegíveis; a bancada de referências usa o fundo branco da janela, e não o creme da página de preparação; e Marca e direção ocupa toda a largura, sem o limite de 760px usado fora do modal.

A saída passa a ser um botão de fechar (X), com nome acessível “Fechar configurações”, fixo no canto superior direito enquanto o conteúdo rola. Ele substitui o botão “Voltar aos posts”/“Voltar ao post” do rodapé. Esc continua fechando. O retorno próprio do painel de referências, compartilhado com a preparação e com o post, não muda.

Referências deste post, aberto por “Escolher mais referências” no post, segue a mesma janela, com título visível e X (“Fechar referências do post”), por pedido posterior na mesma revisão.

Substitui apenas a dimensão de viewport do ADR 0053 para Configurações do projeto e Referências deste post; as demais decisões daquele registro permanecem.

## Implementação

`StudioDialog` aceita uma classe e um rótulo de fechar opcionais. Configurações do projeto usa `studio-modal-framed`, que redefine o tamanho em `studio-guided.css`. A regra de viewport do ADR 0053 permanece para os outros modais com abas.

## Evidência

`project-settings-modal-browser.test.mjs` verifica, em 1440px e 390px, que o diálogo fica dentro do viewport com as margens previstas e centralizado, com o X no canto superior direito e sem botão de retorno no rodapé, opções de IA legíveis, referências no fundo da janela e Marca e direção na largura das abas, além do fluxo de abas já coberto. `brief-interview-browser.test.mjs` verifica a janela e o X em viewports baixos. A verificação é local, com serviços simulados; não comprova outros navegadores ou o ambiente publicado.
