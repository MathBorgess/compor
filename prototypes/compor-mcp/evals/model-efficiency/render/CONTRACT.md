# Compositor comum C2 — contrato v1

Este adaptador local compõe o `piece` de um plano MCP sem corrigir texto, posição ou estratégia. Não gera ativos nem avalia qualidade. Use a mesma versão, catálogo, política e ambiente em todos os modelos e braços.

## Entrada e execução

```json
{
  "piece": {
    "piece_id": "rascunho_1", "version": "v1",
    "width_px": 1080, "height_px": 1080,
    "layers": [{
      "id": "titulo", "kind": "text", "name": "Título proposto", "z_index": 0,
      "rect": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.2},
      "text": "Título proposto", "font_ref": "arial", "font_weight": 400,
      "font_size_px": 48, "color_hex": "#111111", "line_height": 1.2, "text_align": "left"
    }]
  },
  "assets": {"ativo_fornecido": "/caminho/absoluto/ativo.png"}
}
```

```sh
python3 renderer.py --input plano.json --output nova-composicao.png --report novo-relatorio.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -p 'test_*.py' -v
```

Requer Python 3.12 e Pillow 12.3.0 no ambiente verificado. Runtime local observado: `/Users/matheusborges/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`. Arquivos de saída existentes são recusados. Os diretórios de destino devem existir. Código de saída 0 indica composição concluída; 2 indica erro de entrada/renderização, com relatório quando possível. Overflow não produz PNG.

## Trecho para contexto comum dos agentes

- Entregue o `piece` C2 com dimensões explícitas. As coordenadas `rect` são normalizadas de 0 a 1. IDs e `z_index` devem ser únicos.
- `font_ref` disponível: **`arial`** ou **`georgia`**. Cada família oferece somente `font_weight` **400** (regular) e **700** (bold). Não há substituição de família/peso.
- Todos os textos permanecem literais, com tamanho solicitado. Use `\n` quando quiser quebra de linha. Não há quebra automática, redução de fonte ou corte de texto para fazê-lo caber; overflow falha. Posicione caixas suficientes para o conteúdo.
- `asset_ref` deve existir no mapa de ativos fornecido pelo runner. O mesmo ID pode ser reutilizado entre camadas e peças. Uma imagem ausente não vira placeholder.
- Imagens são encaixadas com **contain**, centralizadas em caixa branca, sem recorte. Transparência também compõe sobre essa caixa branca. Use o retângulo do plano para controlar posição e tamanho.
- Formas suportadas: `rectangle` e `ellipse`. Cores usam `#RRGGBB`.
- Defaults comuns, quando os campos C2 opcionais forem omitidos: `font_ref=arial`, `font_weight=400`, `font_size_px=48`, `color_hex=#111111`, `line_height=1.2`, `text_align=left`, `fill_hex=#D9D9D9`. Canvas inicialmente branco. Cada default aplicado aparece no relatório.

## Política exata e limites

As dimensões vêm do plano; não há redimensionamento automático para 1080. O limite local é 16.777.216 pixels por canvas e por ativo de origem, além do limite C2 de 16.384 por eixo. Retângulos convertem bordas normalizadas para pixels com `round` de Python (empates para o par); retângulos menores que um pixel são recusados. Camadas seguem `z_index` crescente.

Alinhamento horizontal usa a caixa métrica de cada linha; a caixa métrica começa no topo da linha, ajustando o bearing da fonte de modo uniforme. A distância entre linhas é `font_size_px × line_height`, arredondada apenas ao posicionar cada linha. Tamanhos fracionários de fonte são preservados pelo Pillow. Métricas e pixels devem caber na caixa. Texto não é truncado, reescrito, rearranjado ou reduzido.

Fontes são lidas do [catálogo explícito](fonts.json); IDs, pesos, caminhos e hashes efetivos são registrados. O catálogo depende de fontes do macOS. Outra máquina deve fornecer o mesmo catálogo/arquivos e verificar os hashes antes de comparar pixels. Não se presume equivalência de pixels entre versões de Pillow/FreeType ou plataformas.

Ativos usam EXIF transpose, conversão RGBA sem transformação ICC, LANCZOS, contain centralizado com deslocamento inteiro para baixo. Não há máscara, crop ou tratamento de texto embutido no ativo. Apenas imagens de um frame são aceitas. Um ativo é lido uma vez por ID em cada composição, e seu hash é registrado em todas as camadas que o reutilizam. Fontes e ativos são desenhados dos mesmos bytes que recebem o hash.

## Evidência

PNG inclui metadados da política, input canônico, renderer, catálogo e núcleo do relatório. O relatório inclui entradas/peça canônicas, runtime, política, defaults usados, fontes, ativos, geometria, linhas literais e SHA-256 do PNG. `render_core_sha256` cobre o relatório antes dos campos que dependem do PNG; `report_payload_sha256` cobre o relatório sem o próprio checksum. A saída JSON do CLI fornece também o hash dos bytes do arquivo de relatório. Nenhum hash circular é alegado.

Os testes usam somente planos e imagens geométricas sintéticos. Verificam overflow, resolução exata, texto/formas, preservação das entradas, reuso de ativo, encaixe sem crop, hashes e recusa de sobrescrita. Não demonstram qualidade visual ou sucesso de uma tarefa real.
