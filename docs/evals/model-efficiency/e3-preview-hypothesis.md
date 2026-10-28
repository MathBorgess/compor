# Próxima hipótese: retorno verificável de composição

28/10/2026. Proposta histórica. Estado atual: [adaptador local implementado e transporte verificado](e3-preview-adapter.md); ainda sem comparação criativa. O E2 foi rejeitado pelos dois Judges.

E2 testa instruções curtas e uma skill. A próxima intervenção, se a qualidade permanecer insuficiente, deve fornecer ao agente retorno do compositor durante a criação: encaixe medido e preview real, com uma oportunidade limitada de reparo antes da entrega. Não acrescentar outra lista de preferências estéticas derivadas dos mesmos Judges.

## Recorte experimental

- Reutilizar compositor, fontes e políticas já congelados, sem trocar copy ou ajustar layout silenciosamente.
- Expor a capacidade ao harness de teste por uma tool somente de leitura/preparação. O host fornece o mapa de assets autorizados; argumentos do modelo contêm IDs opacos e snapshot, nunca caminhos livres, URLs ou scripts.
- A resposta deve identificar peça/versão, hash do plano, diagnóstico de encaixe e preview produzido. Erros também são resultados observáveis, sem arquivo fictício.
- Limitar a duas composições por etapa: primeira e um reparo. Preservar a primeira, mesmo quando o reparo passar. Contabilizar chamadas, tokens e tempo.
- Em revisão local, validar o diff antes de aceitar o reparo: a tool não autoriza ampliar caixa, mover camadas ou trocar palavras fora do pedido.
- Separar diagnóstico geométrico de qualidade: texto que cabe pode continuar pouco legível, genérico ou desequilibrado. Preview só é evidência quando efetivamente entregue e inspecionado.

## Comparação necessária

Mesmo modelo/effort, mesmos assets autorizados e mesmos limites: E2 sem retorno versus E2 com retorno. Casos conhecidos servem ao desenvolvimento. Reservar casos novos antes de usar o resultado como validação independente. Skills e rubrica permanecem congeladas por rodada; o Judge não deve receber identidade do braço nem a explicação persuasiva do autor.

Se ambos ficarem abaixo da régua, registrar a falha e investigar qualidade de direção/representação, em vez de atribuir vitória a menor custo. Se houver ganho, ele pertence ao pacote de retorno/iteração; não inferir que um modelo menor se tornou suficiente em todos os domínios.

Isso é um adaptador local do estudo. Não implica backend novo de produção, exposição pública do MCP, persistência, editor completo ou mudança da arquitetura v0 aprovada.
