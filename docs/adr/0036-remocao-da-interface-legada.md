# ADR 0036 — Remoção da interface de criação legada

- Estado: accepted
- Data: 09/11/2026
- Fonte: autorização explícita de Matheus nesta sessão do Codex para remover o caminho `COMPOR_STUDIO_WEB_ENABLED=false`, em continuidade à issue #27.

## Decisão

O app usa sempre o estúdio atual. Removemos o seletor de interface, a importação dinâmica de `legacy-workspace` e seus componentes exclusivos de projetos, peças, composição e fluxo antigo do agente. Configurar a variável antiga deixa de trocar a interface ou de impedir a entrada leve. A recuperação operacional passa pelo histórico Git e por uma versão anterior do aplicativo.

Esta decisão substitui o rollback por variável descrito no guia de arquitetura e a pendência de decisão sobre o legado no ADR 0033. O ADR 0034 foi aceito em revisão delegada pelo diretor de publicidade e AX nesta sessão, preservando seus limites. A retirada da condição do seletor não amplia a cobertura da medição nem comprova deploy.

Os endpoints, as versões salvas, o armazenamento privado, os rascunhos locais e suas chaves não são removidos. `AssetRecovery`, `StudioAssets` e os contratos compartilhados usados pelo estúdio continuam disponíveis. A biblioteca de composição PNG e seus testes independentes preservam o contrato de bytes da arte integral.

## Cobertura e medição

Os testes exclusivos da interface retirada saem com ela. As suítes HTTP de projetos, peças, imagens e tentativas continuam. Recuperação paginada, descarte de prévia ao trocar versão/conta e PNG multipart com verificação de hash passam a usar uma fixture do `StudioAssets` atual. O teste BYOK passa pelo estúdio atual e mantém verificações de memória, revalidação, troca de conta, desconexão e saída.

Entrada e rascunhos herdados são verificados pela entrada leve e pelo estúdio atual. Conflito de versões e resultados desconhecidos continuam cobertos pelas suítes `studio-chat-flow`, `studio-image-receipt`, `studio-assets` e seus contratos de servidor. Nenhum teste faz chamada paga.

A comparação do analisador e do gzip por arquivo fica em [remoção do legado](../quality/legacy-removal-2026-11-09.md). São métricas distintas; a atribuição histórica de 15.684 bytes não é uma promessa de economia transferida.
