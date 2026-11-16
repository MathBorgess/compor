# ADR 0059 — Referências do projeto e do post em janela modal

- Estado: implementado localmente; publicação fora deste escopo.
- Data: 16/11/2026.
- Fonte: pedido explícito de Erick na revisão local: ao clicar em Referências nas Configurações do projeto, a bancada deve abrir no próprio modal, e não em tela cheia. No mesmo dia, pediu o mesmo para “Escolher mais referências” no post.

## Decisão

A aba **Referências** de Configurações do projeto mostra a bancada do ADR 0058 dentro da janela modal do ADR 0055, junto das demais abas e do X “Fechar configurações”. A bancada ocupa a largura da janela, com fundo branco; galeria, fonte, seleção, conversa sob demanda e “Voltar aos posts”/“Voltar ao post” continuam os mesmos e fecham o modal ao continuar.

“Escolher mais referências” no post abre a mesma bancada numa janela própria, com título “Referências deste post” e X “Fechar referências do post”, no mesmo tamanho da janela de configurações e com o alcance do post. “Voltar ao post” fecha a janela preservando rascunho, imagem, versões e conversa.

A preparação inicial e “Abrir a conversa desse pedido” continuam abrindo a página dedicada do ADR 0058. O alcance aberto pela aba das configurações continua sendo o do projeto.

## Supersessão e preservação

Substitui o ADR 0058 apenas para as entradas pela aba Referências de Configurações do projeto e por “Escolher mais referências” no post. Não muda o contrato visual da galeria, geração mediante pedido explícito, lotes, esperas, consentimento do Pinterest, persistência, credenciais ou RLS.

## Verificação

Verificado no ambiente de revisão local (`.local-review`), em 1440×900, com serviços simulados: a aba abre no modal, a conversa alterna com a galeria e a troca de abas preserva o modal; “Escolher mais referências” abre “Referências deste post” e “Voltar ao post” a fecha. `project-settings-modal-browser.test.mjs` verifica que a aba mantém o diálogo visível e que a bancada ocupa a largura das abas; `reference-v0-browser.test.mjs` verifica o diálogo “Referências deste post”. Não comprova outros navegadores nem o ambiente publicado.
