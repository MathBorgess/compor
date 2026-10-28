# Composição experimental H2

```sh
python3 -B prototypes/compor-mcp/evals/render-h2.py
```

O script separado reutiliza as funções de `render-candidates.py` e o plano original de H0_D2, conforme a instrução de `sessions/H2-output.json`. Substitui somente o ativo de imagem por `sessions/assets/H2_D2.png`; não escreve nos candidatos, imagens de origem, composições H0/H1 ou relatório original.

Antes de compor, verifica que dimensões, texto, geometria e estilos de H2 correspondem ao baseline. O `font_ref: inter` do schema H2 é resolvido explicitamente para a família Inter do plano original. A adaptação continua exatamente a mesma: Arial, com pesos 400→400, 500→400 e 600→700. Os arquivos de fontes, o renderer e o baseline precisam manter os hashes registrados na primeira execução; diferenças interrompem este ensaio em vez de reinterpretar o baseline silenciosamente.

Saídas:

- `sessions/composites/H2_D2.png`: composição 1080×1350.
- `sessions/composites/H2-render-report.json`: hashes, fontes por camada, dimensões, verificação por pixels e mapeamento para o coordenador.
- `sessions/blind/h2/X.png`, `Y.png` e `contact-sheet.png`: cópias e comparativo com rótulos neutros. O relatório revela o mapeamento e deve ficar fora do briefing cego do Judge.

Na execução de 28/10/2026, o ativo H2 tinha 1448×1086 e ocupou 1080×810 sem recorte ou faixas. Nenhum texto precisou de ajuste de tamanho. Toda a área de leitura, de (0,810) até (1080,1350), foi comparada com H0_D2: 1080×540 pixels, zero pixels diferentes. Isso demonstra a preservação do painel de texto; a imagem gerada pode mudar em toda a sua extensão.

O compositor valida por hash que as evidências H0/H1 protegidas não mudaram durante a execução. Os avisos de imagem pendente e fonte não resolvida do JSON H2 permanecem na origem; o relatório registra a resolução observada neste experimento. O script não promove o candidato, pontua qualidade nem altera memória ou preferências.
