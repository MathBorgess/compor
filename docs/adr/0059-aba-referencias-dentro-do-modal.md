# ADR 0059 — Aba Referências dentro de Configurações do projeto

- Estado: implementado localmente; publicação fora deste escopo.
- Data: 16/11/2026.
- Fonte: pedido explícito de Erick na revisão local: ao clicar em Referências nas Configurações do projeto, a bancada deve abrir no próprio modal, e não em tela cheia.

## Decisão

A aba **Referências** de Configurações do projeto mostra a bancada do ADR 0058 dentro da janela modal do ADR 0055, junto das demais abas e do X “Fechar configurações”. A bancada ocupa a largura da janela, com fundo branco; galeria, fonte, seleção, conversa sob demanda e “Voltar aos posts”/“Voltar ao post” continuam os mesmos e fecham o modal ao continuar.

A preparação inicial, “Escolher mais referências” no post e “Abrir a conversa desse pedido” continuam abrindo a página dedicada do ADR 0058. O alcance aberto pela aba continua sendo o do projeto.

## Supersessão e preservação

Substitui o ADR 0058 apenas para a entrada pela aba Referências de Configurações do projeto. Não muda o contrato visual da galeria, geração mediante pedido explícito, lotes, esperas, consentimento do Pinterest, persistência, credenciais ou RLS.

## Verificação

Verificado no ambiente de revisão local (`.local-review`), em 1440×900, com serviços simulados: a aba abre no modal, a conversa alterna com a galeria e a troca de abas preserva o modal. Não comprova outros navegadores nem o ambiente publicado.
