# Composição experimental H4

```sh
python3 -B prototypes/compor-mcp/evals/render-h4.py --preflight
python3 -B prototypes/compor-mcp/evals/render-h4.py
```

O adaptador é independente dos renderers anteriores. Lê os dois planos C2 de `sessions/H4-output.json`, com camadas de texto separadas, formas rectangle/ellipse e exatamente um ativo retangular por direção. Resolve `asset_existing` ou `asset_expected_path` dentro de `sessions/assets`. Se um ativo faltar, informa o caminho e não cria placeholder nem composição. O modo preflight valida o texto sem exigir ativos presentes.

Todos os textos passam pelo preflight antes da primeira composição: preserva conteúdo, quebras, origem, alinhamento, tamanho e entrelinha. Texto que exceda a largura/altura disponível provoca falha; não há redução de fonte. As fontes locais são resolvidas por mapeamento explícito de `arial`, `georgia` e `inter`. Inter, se solicitado, usa Arial como nas rodadas anteriores. Peso 600 usa Bold 700; outros pesos não disponíveis são registrados individualmente. H4 usa Arial e Georgia, sem Inter.

O encaixe da imagem é contain com LANCZOS, sem corte, máscara, deformação ou transparência presumida. O preenchimento de eventual faixa vem do `render_instruction.letterbox_fill`. A geometria normalizada é arredondada para pixels com `round`, como nas rodadas anteriores.

Na execução de 28/10/2026:

| Direção | Ativo real | Caixa da imagem: x,y,w,h | Imagem colocada | Faixa |
| --- | --- | --- | --- | --- |
| H4_D1 | 1254×1254 | 275,448,734,734 | 734×734 | Nenhuma |
| H4_D2 | 1122×1402 | 394,225,616,769 | 615×769 | 1 px à direita, marfim |

As 11 caixas de texto foram renderizadas sem redução. O apoio H4_D2 contém **um pixel de overhang tipográfico** do “A” da Arial 43: (69,1138), enquanto a caixa começa em x=70. O pixel é preservado, sem deslocar a origem ou recortar o glifo. Esse bearing natural fica registrado no relatório; não é um corte. As outras dez caixas não têm pixels fora de seus limites. Uma entrada sintética com texto longo confirmou a falha no preflight antes de compor.

Saídas:

- `sessions/composites/H4_D1.png` e `H4_D2.png`, ambos 1080×1350.
- `sessions/composites/H4-render-report.json`, com hashes, fontes, texto integral, caixas, posição real das imagens, faixas e limites de pixels.
- `sessions/blind/h4/M1.png`, `M2.png`, `N1.png`, `N2.png` e `contact-sheet.png`, com labels neutros. O mapeamento fica no relatório do coordenador e não deve integrar o briefing cego.

Os arquivos de entrada e as evidências H0–H3, incluindo seus renderers e relatórios, foram verificados por hash antes/depois. Duas execuções consecutivas produziram os mesmos hashes de composições, relatório e comparativo. Nenhum plano foi reescrito. H4 altera várias dimensões criativas; esta comparação não isola causalmente uma skill, tool ou decisão. A inspeção de renderização não equivale a preferência humana ou aprovação do candidato.
