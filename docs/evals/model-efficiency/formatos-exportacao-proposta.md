# Formatos de saída: hipóteses e primeira skill candidata

**Origem:** feedback de Matheus durante o teste de usuário do PR 9, em 28/10/2026. Ao solicitar um carrossel para apresentar o Compor, ele observou que as quatro imagens pareciam peças de marketing independentes, sem a coesão esperada de uma sequência. Sua direção é que cada tipo de saída tenha uma skill com orientações próprias. Aprovar uma direção visual representa preferência, não um template único; variações e versões anteriores precisam continuar recuperáveis quando a capacidade existir.

## Inventário inicial proposto

| Ordem sugerida | Tipo de entrega | Por que considerar | Estado e prioridade |
| --- | --- | --- | --- |
| 1 | Arte estática e legenda | Unidade central já proposta para a rodada criativa; peça e texto precisam manter mensagem e identidade em conjunto. | Escopo da primeira versão na spec: PNG e TXT propostos; skill de formato específica ainda não criada. |
| 2 | Carrossel de Instagram | Pedido e falha de coesão observados no teste; requer arco, ordem e sistema visual de conjunto. | [Skill candidata](../../../prototypes/compor-mcp/evals/candidates/carrossel-instagram/SKILL.md), ainda sem integração ou avaliação comportamental. Carrossel estava fora da primeira versão; prioridade de produto e mudança de escopo seguem decisão pendente. |
| 3 | Peça vertical para stories | Possível adaptação de uma campanha para outro contexto de leitura e uso; a orientação precisa tratar hierarquia e áreas potencialmente ocupadas pela interface. | Hipótese posterior, sem skill nem validação de necessidade. |
| 4 | Conjunto de variações para anúncio | Peças comparáveis podem compartilhar fatos e identidade enquanto testam ângulos; não confundir com slides sequenciais de um carrossel. | Hipótese posterior, sem skill, publicação ou medição de desempenho. |

A ordem é proposta de trabalho, não evidência de demanda nem mudança aprovada da v0. Outros formatos devem surgir de pedidos e uso, não de um catálogo completo antecipado. Cada skill deve explicitar seu tipo de saída, continuidade entre peças quando necessária, revisão e limites; dados de plataforma e dimensões devem ser conferidos quando aplicáveis.

## Limites e próximo teste

O catálogo MCP do PR 9 é fixo e continua com quatro skills. Esta candidata é um arquivo separado para revisão: não é carregada automaticamente pelo servidor, não altera contratos e não acrescenta exportação ou persistência. Ela orienta a planejar e revisar o conjunto antes de gerar, mas sua existência não prova melhora. Uma avaliação posterior pode comparar um pedido equivalente com e sem a skill, mostrando as páginas lado a lado e solicitando avaliação humana de narrativa, coesão e diversidade; sem esse ensaio, o efeito é desconhecido.

Referência de escopo: [especificação de produto](../../specs/compor-macos-v1.md) e [visão de produto](../../produto.md). A spec coloca carrossel, vídeo e publicação automática fora da primeira versão e descreve a saída estática proposta. Nenhuma publicação, implantação ou mudança de escopo foi feita nesta nota.
