# Spike sintético — composição em camadas

Este experimento chama `prepare_layered_creative` pelo MCP em memória e usa o snapshot retornado para compor uma peça fictícia em oito camadas locais (fundo, painel, título, descrição, arte raster gerada geometricamente, preço, forma do CTA e texto do CTA). A variante altera diretamente, no código, apenas o tamanho da fonte da camada `preco`, sem alterar `R$ 99`. O script gera as duas composições PNG, as especificações JSON e um relatório de verificações em `output/`.

```sh
cd prototypes/compor-mcp
npm run build
python3 spike-layers/spike.py
```

Requer Python 3 e Pillow, testado com Pillow 12.2.0. A fonte padrão escalável exige uma versão de Pillow que aceite `ImageFont.load_default(size=...)`; versões antigas usam fallback fixo e o teste de alteração visual deve falhar, em vez de declarar êxito. A renderização pode variar com a versão de Pillow e da fonte embutida; hashes de pixels documentam a execução, não estabelecem um resultado universal. Não há dependência de serviços externos ou dados reais. A tool não renderiza; um renderer Pillow separado consome o snapshot e só resolve a imagem sintética conhecida. A anotação e a alteração de tamanho são pré-definidas no script.

Verificações executadas no script: valor e especificações das demais camadas continuam iguais; os pixels das camadas que não são preço continuam iguais; as alterações na imagem composta ficam restritas à união das áreas com pixels da camada de preço antes/depois. Os PNGs foram inspecionados visualmente como ilustrações sintéticas, não como criativos aprovados.

**Limites:** a seleção de camada e a troca de tamanho foram definidas manualmente no script; há chamada MCP real em memória, mas não há agente, interpretação da crítica, interface, autenticação, avaliação por pessoa, persistência de produto nem geração de imagem por IA. Uma imagem produzida por modelo continua sendo uma camada raster achatada; este ensaio não demonstra decomposição automática, inpainting, fontes finais, preservação de pixels em modelos ou paridade com Figma/Canva. Os arquivos de saída são artefatos locais de experimento, não dados de usuários.
