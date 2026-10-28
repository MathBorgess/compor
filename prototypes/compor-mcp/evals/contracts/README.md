# Contratos MCP — onda adversarial de 28/10/2026

Cinco casos sintéticos foram fixados a partir de observações da revisão, antes de alterar `src/server.ts`. O runner faz chamadas MCP reais em memória, sem modelo, usuário, autenticação, banco ou dados privados. `baseline.json` preserva as entradas, saídas, versões do runtime e hashes do código antes da correção; `candidate.json` faz o mesmo depois. O runner, as entradas e os critérios são iguais nas duas execuções.

| Contrato exercitado | Baseline | Candidato |
|---|---|---|
| Caixa de moodboard fora do quadro é rejeitada | Falhou | Passou |
| Área sem alvo ou com candidatos múltiplos tem estado explícito | Falhou | Passou |
| Placeholder de imagem sem ativo gera aviso | Falhou | Passou |
| Peso acima do envelope técnico é rejeitado | Falhou | Passou |
| Escopo produto pede confirmação externa e avisa falta de produto | Falhou | Passou |

**Resultado:** 0/5 → 5/5, com zero chamadas ao `fetch` global. Isso mede contratos específicos escolhidos após observar as falhas; não é conjunto cego, teste estatístico, benchmark de criatividade, prova de ausência geral de rede ou demonstração de melhoria no agente. A suíte de regressão passou com 22 testes após a correção.

## Decisões técnicas do candidato

- `Number.MAX_SAFE_INTEGER` é somente um teto técnico para magnitude numérica; não define equivalência, normalização ou escala semântica entre frequência, sugestão e escolha. Pesos fracionários continuam permitidos e zero continua distinto de ausência. A UI precisa de sua própria regra explícita de dimensionamento.
- A geometria do moodboard valida a caixa **antes de rotação**. Rotação não nula emite `rotated_bounds_not_checked`; o renderer ainda precisa verificar seus limites efetivos. Nenhum ajuste ou clipping é silencioso.
- Uma área retorna `unresolved`, `ambiguous_candidates` ou `single_geometric_candidate`. Uma camada escolhida por ID retorna `explicit_layer`. Um único candidato geométrico não prova reconhecimento semântico nem concede permissão para edição.
- Camada de imagem sem `asset_ref` continua representável como placeholder com `image_asset_missing`; isso não equivale a ativo resolvido.
- `memory_scope_claim: product` sempre resulta em `requires_verified_confirmation`, mesmo com `product_ref`. Se o contexto do produto estiver ausente, também retorna `product_context_missing`. Nenhum booleano fornecido pelo modelo é aceito como prova de confirmação. A autenticação e a confirmação real precisam ser estabelecidas pelo backend; a tool não altera memórias.

## Reproduzir sem substituir evidência

Após `npm run build`, crie uma nova pasta irmã de `contracts` contendo apenas uma cópia de `run.mjs` e execute `node evals/NOVA_PASTA/run.mjs candidate`. Os imports continuam resolvendo para o mesmo servidor. O runner recusa sobrescrever um arquivo de evidência existente. A reprodução do baseline exige o código anterior à correção e sua compilação; os hashes no arquivo permitem verificar a identidade.

O runner congelado tem SHA-256 `684e581851bae208f661fc011c251ed3bf9c81ff2c09a00c01a2b5258c6a2ce0`. Arquivos de resultado contêm timestamp e hashes de fonte/build; não afirmar que qualquer checkout posterior reproduz o mesmo candidato sem conferir esses hashes.
