# Piloto de repetibilidade do juiz visual

Em 22/11/2026, renderizamos seis pares sintéticos de quatro lâminas em Chromium. A revisão cega do `gpt-6.1-terra` via Codex CLI reconheceu os três defeitos plantados e classificou três pares como livres de defeitos críticos. Os rótulos foram congelados antes do julgamento de cada diagnóstico. O `gpt-6.2-astra` usou o mesmo transporte, com duas repetições em cada ordem A/B e B/A por diagnóstico.

| Diagnóstico | Preferência e defeito plantado | Divergências frente à referência |
| --- | --- | --- |
| Autonomia da segunda lâmina, rubrica inicial | Preferiu a versão íntegra e detectou a dependência nas quatro sessões. | A referência também marcou a dimensão editorial na mesma lâmina. As quatro sessões classificaram só o defeito primário. O desvio-padrão chegou a 0,433 em editorial e 0,354 em ritmo. O erro absoluto médio chegou a 0,875 em voz e 1,0 em fechamento. |
| Pedidos empilhados no fechamento, rubrica revisada | Preferiu a versão íntegra e detectou os cinco pedidos concorrentes nas quatro sessões. | Uma sessão na ordem inversa marcou a arte compartilhada como defeito crítico nos dois lados, sem correspondente na referência. O desvio-padrão chegou a 0,354 em arte–mensagem e hierarquia. O erro absoluto médio chegou a 1,0 em capa e editorial e 0,875 em ritmo. |

A rubrica revisada atribui cada defeito à dimensão primária, exige evidência própria para um defeito adicional, diferencia pedidos de interação das instruções da peça e fixa âncoras inteiras de 0 a 5. O validador recusa evidência literal repetida na mesma lâmina e conserva o teto 2 onde houver defeito crítico. A revisão recebe um novo hash de rubrica. [Rubrica do juiz](../../scripts/evals/carrossel/judge-evidence.mjs)

Os dois diagnósticos tiveram a mesma preferência nas ordens invertidas e ultrapassaram o limiar de desvio-padrão de 0,35 em pelo menos uma dimensão. Cada rubrica foi observada em um caso diferente, o que impede estimar o efeito da revisão. A referência foi produzida por outro modelo. A calibração exige a coorte completa e recibos da Agents API. A promoção também depende dos gates das partições seladas. Imagens, rótulos e recibos do piloto estão fora do Git. [Protocolo de calibração](../../scripts/evals/carrossel/README.md#calibração-do-juiz-visual)
