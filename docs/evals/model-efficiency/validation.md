# Verificação final local

28/10/2026, macOS, branch `codex/mcp-model-efficiency`.

| Verificação | Resultado observado |
|---|---:|
| `npm test` em `prototypes/compor-mcp` (build TypeScript + testes MCP) | 31/31 |
| `python -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency` (Python com Pillow) | 62/62 |
| `python3 -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency/runtime` | 8/8 |
| `python -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency/render` (Python com Pillow) | 9/9 |
| Total de testes automatizados | **110/110** |

As fixtures automatizadas não chamam modelos nem demonstram satisfação de usuários. As trajetórias reais de modelos são um conjunto separado: 12 low e 12 medium, com casos e reações fictícios.

O teste MCP verifica catálogo E0 byte-idêntico ao PR8 e paridade de resultados/erros entre E0/E1, incluindo entradas inválidas. Os auxiliares verificam continuidade, recusa de artefatos alterados, cadeia de render, falhas do lote e métricas sem dupla contagem.

Runner congelado: `00d97b5632a3f4b2c732a1cc12171109e311634a2287592ffee4db54632e78a6`. Renderer congelado: `4cb02579c07e2378b81ee6d4dff69dae7188f09141cfece65d2b12aff32b5305`. Os dois hashes foram conferidos após os testes. Helpers corrigidos estão em `coordinator-final.json`; versões anteriores relevantes foram preservadas.

A inspeção por padrões de tokens OpenAI/GitHub e cabeçalhos de chave privada não encontrou correspondências nos arquivos textuais do estudo. Isso é uma verificação delimitada, não prova de inexistência de todo dado sensível. O runtime não leu nem copiou credenciais.

Condições do provedor e modelos retornados não expostos permanecem desconhecidos. Os testes locais não substituem CI, validação humana dos criativos ou aprovação da arquitetura.
