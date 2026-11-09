# ADR 0030 — Variante, retoque e cards no canvas

- Estado: accepted
- Data: 09/11/2026
- Fonte: revisão do estúdio web por Matheus e decisões dele numa sessão do Claude Code em 09/11/2026.

## Contexto

Matheus pediu que "toda versão que teve um major, mudando estilo" vire um novo card no canvas, mantendo a versão anterior visível para a pessoa explorar e ver a evolução.

Hoje toda geração ou edição salva a versão seguinte da mesma peça. O quadro mostra só a versão selecionada, e a troca de versão fica na gaveta Bases. A proposta de imagem distingue `create` de `edit`, mas isso não é salvo. Cada versão nova herda a aprovação da anterior.

## Decisão

**Termos.** Uma variante é uma versão que muda uma dimensão criativa declarada. Um retoque corrige texto, grafia ou detalhe e mantém a dimensão. As definições estão no [glossário](../../GLOSSARY.md). O termo "ajuste" foi evitado porque `Adjustment` já nomeia, no código, qualquer pedido enviado ao agente.

**Quem classifica.** O agente declara a dimensão alterada ao propor a imagem, dentro de um conjunto fechado: estilo, composição ou gancho. Sem dimensão declarada, a versão é um retoque. A operação `create` ou `edit` não decide a classificação, porque uma edição pode mudar o estilo e uma geração nova pode mantê-lo.

**Modelo.** Variantes continuam na mesma peça. `piece_version_metadata` ganha duas colunas opcionais, `changed_dimension` e `operation`. A coluna `base_version` já liga cada versão à sua origem. Um card reúne uma variante e os retoques que descendem dela, e a primeira versão abre o primeiro card. Versões antigas, sem dimensão registrada, contam como retoques do primeiro card. Nenhuma classificação retroativa é inferida. A numeração linear, a recuperação de conflito do [ADR 0024](0024-exploracao-limitada-e-pecas-flexiveis.md) e o "Novo post" continuam como estão.

**Aprovação.** Um retoque herda a aprovação da sua origem. Uma variante começa sem aprovação, porque traz um visual que a pessoa ainda não aprovou. Isso muda o comportamento atual, em que toda versão nova herda a aprovação.

**Imagens.** Cada card mostra a imagem da sua versão mais recente. Hoje só a versão selecionada carrega imagem local. A implementação passa a carregar a imagem por versão e usa a recuperação do armazenamento privado quando ela não estiver no navegador.

## Implantação

A migration só acrescenta colunas e uma versão nova da função de salvamento. `save_piece_version_v2` continua funcionando para o app já publicado. Como o workflow aplica migrations em todo push na `main`, a migration entra na `main` no merge final da branch `compor/feedback-estudio`, logo antes do deploy.

## Limites

Testes com fornecedor simulado e banco local verificam classificação, agrupamento, aprovação e compatibilidade da função antiga. Eles não mostram se a dimensão declarada pelo agente coincide com o que a pessoa percebe como mudança de estilo. Isso entra no teste de comportamento final. O desenho dos cards sai do protótipo descrito no [ADR 0031](0031-faixa-de-contexto-publico-unico-e-revisao.md). A regra do [ADR 0023](0023-referencias-e-conversa-flutuante.md) de não pôr avaliações ou comentários nos cartões continua valendo.
