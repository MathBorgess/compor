# Revisão visual da proposta 2

Data: 16/11/2026. Escopo: referências, preparação do primeiro post e consulta de aprendizados após excluir um projeto. Interface real Next local com dados sintéticos. Nenhum projeto remoto foi excluído.

## Fonte e comparação

A segunda imagem escolhida é `/Users/matheusborges/.codex/generated_images/01a1e3d3-a16f-7400-b40c-de06cf0632d3/exec-acb818f2-d964-4aa3-8dad-c234587970d9.png`, de 1487 × 1058 px. O contrato implementável está em [referências focadas](docs/design/2026-11-16-referencias-focadas.md).

A comparação visual reuniu a fonte e a captura real na mesma inspeção. O navegador usou viewport de 1487 × 1058 px, etapa Referências da preparação e duas imagens escolhidas. A captura de página inteira inclui o conteúdo abaixo do viewport, pois o rodapé permanece no fluxo normal.

Diferenças intencionais: as imagens são os ativos de avaliação Trama de aula existentes no repositório, sem novas chamadas de geração. A fonte visível é Propostas do Compor, sem IA conectada, em vez de resultados externos do Pinterest. Essa fonte preserva avisos de disponibilidade e consulta do histórico. A marca e o menu da conta continuam sendo os componentes atuais do produto. O contêiner segue o limite explícito de 1200 px; não reproduz as medidas aproximadas do mockup gerado.

## Capturas de validação local

- [Preparação no desktop](docs/quality/evidence/references-focused-2026-11-16/references-preparation-desktop.jpg).
- [Preparação em 320 px](docs/quality/evidence/references-focused-2026-11-16/references-preparation-mobile-320.jpg).
- [Perfil após excluir o último projeto de teste](docs/quality/evidence/references-focused-2026-11-16/profile-after-delete-mobile.jpg).
- [Post preservado ao retornar](docs/quality/evidence/references-focused-2026-11-16/post-return-mobile.jpg).

As capturas estão versionadas para revisão do PR. São evidências locais com dados sintéticos; não representam produção. A captura do perfil antecede apenas uma redução de texto auxiliar feita na otimização do bundle; a retenção foi revalidada depois.

## Resultado observado

Resultado da revisão visual: **aprovado para o contrato escolhido**. Isto não equivale a aprovação editorial de Matheus nem a paridade de pixels com a imagem gerada.

| Regra | Observação no navegador |
| --- | --- |
| Conteúdo de até 1200 px | Três colunas de 384 px no viewport de 1487 px |
| Espaço entre cards | 24 px horizontal, 32 px vertical |
| Molduras sem corte | 384 × 384 px no desktop, 288 × 288 px em 320 px; `object-fit: contain` |
| Texto e hierarquia | Título com peso 700; contador e CTA com 16 px |
| Tela estreita | Uma coluna e `scrollWidth` de 320 px para viewport de 320 px |
| Controles | Botões observados com altura mínima de 44 px |
| Seleção | Duas bordas azuis e checkboxes marcados; ampliar não escolhe imagem |
| Conversa | Rascunho permanece após alternar para imagens e voltar |
| Primeiro post | Referências abrem o pedido; nome recebe foco; criar confirma o catálogo |
| Retorno | “Escolher mais referências” conserva o post e volta ao mesmo editor |
| Perfil | Sinais continuam consultáveis após excluir o único projeto; origem identificada |

Os testes automatizados cobrem também teclado, Escape, foco restaurado, permissão de imagens externas, estados de falha e outros viewports. A revisão manual registrou zero erros de console. O log HTTP sintético registra um recibo de post, quatro sinais de seleção e nenhuma chamada de geração ou turno do modelo.

## Correções feitas durante a revisão

A regra global de botões aplicava padding às prévias; as molduras passaram a respeitar o quadrado. O rodapé herdava fonte pequena e espaçamento de outra superfície; recebeu tipografia e espaçamento próprios. O título ganhou o peso definido e a seleção ganhou borda azul verificável.

Abrir o perfil suspendia o estúdio inteiro no primeiro carregamento do módulo. O perfil passou a ser carregado com o estúdio, evitando essa suspensão. Uma falha de gravação ao retirar referência agora restaura a seleção e informa que não houve confirmação, em vez de anunciar sucesso.

## Limites

As imagens do Pinterest e a IA foram simuladas nos testes. A visita manual não usou credenciais, login externo, fornecedores pagos nem dados reais. Critérios locais continuam restritos ao navegador. A leitura de cinco segundos e o intervalo entre lotes usam os controladores existentes; não foi medido tempo de resposta de fornecedores.
