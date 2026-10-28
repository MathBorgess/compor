# Composição experimental H3

```sh
python3 -B prototypes/compor-mcp/evals/render-h3.py
```

O script separado compõe os dois planos C2 de `sessions/H3-output.json`, resolvendo explicitamente `font_ref: inter` para Inter e reutilizando a adaptação anterior para Arial. H3_D1 usa o ativo de H0_D1; H3_D2 usa o ativo de H2_D2. Somente os textos de headline e apoio mudam. O script não reescreve, melhora ou quebra os textos de outro modo.

Antes da renderização, compara IDs de camadas, geometria, cores, fontes, pesos, tamanhos, entrelinhas, alinhamento, marca e CTA com os planos anteriores. Verifica hashes de ativos, arquivos de fontes, composites, renderer e entradas. Uma mudança de estilo, ativo, runtime ou redução de fonte interrompe o ensaio.

Saídas:

- `sessions/composites/H3_D1.png` e `H3_D2.png`, ambos 1080×1350.
- `sessions/composites/H3-render-report.json`, com hashes, texto integral e adaptações por camada, mapeamento do coordenador e verificações por pixels.
- `sessions/blind/h3/K1.png`, `K2.png`, `L1.png`, `L2.png` e `contact-sheet.png`, com identificadores neutros. O relatório revela o mapeamento e não deve integrar o briefing cego do Judge.

Verificações observadas em 28/10/2026:

- Os ativos, redimensionados para 1080×810 sem recorte, mantiveram os mesmos hashes de origem.
- Em cada composição, a zona inteira de imagem (0,0)–(1080,810) permaneceu idêntica ao respectivo baseline.
- Fora das caixas headline (76,934)–(1005,1096) e apoio (76,1126)–(1005,1200), nenhum pixel mudou.
- Nenhuma fonte foi reduzida. A marca e o CTA mantiveram seus pixels.
- Duas execuções consecutivas produziram hashes idênticos de composites, relatório e comparativo.
- As evidências e relatórios anteriores não foram reescritos; seus hashes são preservados no relatório H3.

Essas verificações demonstram isolamento das mudanças de texto. Não avaliam qualidade criativa, preferência humana ou resultado comercial. O compositor continua experimental e separado da implementação do Compor.
