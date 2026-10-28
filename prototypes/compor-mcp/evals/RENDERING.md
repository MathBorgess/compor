# Composição experimental dos candidatos

`render-candidates.py` usa os planos dos dois candidatos e os quatro ativos de imagem gerados separadamente. Não altera os planos originais, a copy ou os arquivos de imagem. É um compositor experimental Pillow para este ensaio, não o compositor implementado do Compor.

```sh
python3 prototypes/compor-mcp/evals/render-candidates.py
```

Entradas: `sessions/H0-output.json`, `sessions/H1-output.json`, `sessions/assets/{H0_D1,H0_D2,H1_D1,H1_D2}.png`. Saídas: quatro PNGs em `sessions/composites`, um `render-report.json` com hashes e adaptações por camada, e cópias neutras em `sessions/blind` para avaliação. O mapeamento está no relatório do coordenador e não deve ser apresentado ao Judge antes do julgamento.

O plano H0 usa um objeto `layer_plan` com dimensões; H1 usa uma lista de camadas e o canvas 1080×1350 definido no briefing. Ambos são interpretados a partir dos retângulos normalizados. O texto é desenhado em camada própria, respeitando quebras de linha explícitas. Se não couber, a política comum reduz apenas o tamanho da fonte até caber e registra a mudança; falha se não couber nem com 6px. Essa possibilidade não foi necessária nos quatro outputs observados.

Na execução de 28/10/2026, com Pillow 12.2.0:

- Os quatro ativos tinham 1448×1086, proporção 4:3, e foram redimensionados para 1080×810 sem recorte ou faixas.
- H0 pede Inter, indisponível no sistema observado. Foi usada Arial, com 400→400, 500→400 e 600→700; esse é um fator limitante da comparação. Os hashes e caminhos de fontes estão no relatório.
- H1 pede Arial e Georgia; as fontes locais solicitadas estavam presentes.
- Nenhum texto precisou ser redimensionado. Os PNGs foram inspecionados: texto íntegro, sem corte observado.

Uma execução em outro sistema pode não ter as mesmas fontes. O script falha se as fontes locais explicitamente resolvidas estiverem ausentes, em vez de fazer substituição silenciosa. Reprodutibilidade de pixels exige os mesmos planos, ativos, Pillow e arquivos de fontes; hashes são preservados no relatório.
