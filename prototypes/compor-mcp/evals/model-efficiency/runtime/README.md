# Runner observável: Codex + MCP stdio C2

Este runner executa uma trajetória sintética com turnos sequenciais no Codex instalado. Usa a autenticação nativa, sem ler ou copiar credenciais, sem mudar configuração global ou `CODEX_HOME`. Não inicia uma matriz automaticamente.

## Uso

Pré-requisitos: POSIX/macOS, Python 3.10+, Codex já autenticado, Node e `npm run build` concluído em `prototypes/compor-mcp`.

```sh
python3 prototypes/compor-mcp/evals/model-efficiency/runtime/runner.py \
  --model gpt-6.1-terra --effort low --guidance baseline \
  --case-json /caminho/absoluto/caso.json \
  --run-dir /caminho/novo/run-001 --through-turn 3
```

O diretório da execução deve ser novo. `model`, `effort` e `guidance` são obrigatórios. Os modelos aceitos são `gpt-6.1-terra`, `gpt-6.1-sol`, `gpt-6-astra`; as variantes MCP são `baseline` (E0) e `guided_v1` (E1). A disponibilidade de cada combinação de modelo/effort deve ser verificada no runtime; suporte a `low` não demonstra suporte aos demais efforts.

Contrato do caso (não incluir respostas esperadas ou juiz):

```json
{
  "id": "caso-sintetico-001",
  "synthetic": true,
  "turns": [
    {"id": "intencao", "prompt": "Texto sintético do primeiro turno."},
    {"id": "referencias", "prompt": "Texto sintético do segundo turno."},
    {"id": "direcoes", "prompt": "Produza as direções e seus planos de imagem."},
    {"id": "convergencia", "prompt": "Seleção explicitamente sintética da direção A.", "images": ["imagem-a.png"]},
    {"id": "critica", "prompt": "Critique por aspecto o resultado anexado.", "images": ["imagem-a-editada.png"]}
  ]
}
```

Caminhos de imagens podem ser absolutos ou relativos ao arquivo do caso. O runner aceita PNG, JPEG e WebP existentes e registra SHA-256. O CLI recebe a imagem pelo argumento `--image`; não há geração dentro do runner. O suporte à flag foi observado no help do CLI; a percepção de imagens não foi testada nos probes de conectividade.

## Pausa para geração e retomada

`--through-turn 3` executa somente os três primeiros prompts e termina com `status: paused`. `turn-03.json` contém `assistant_messages`, eventos completos e a resposta com planos/prompts. `mcp.jsonl` preserva argumentos e resultados nativos; o coordenador pode gerar os ativos a partir desses dados.

Depois, acrescente os caminhos de imagens e a seleção sintética aos turnos ainda não enviados. Retome:

```sh
python3 prototypes/compor-mcp/evals/model-efficiency/runtime/runner.py \
  --model gpt-6.1-terra --effort low --guidance baseline \
  --case-json /caminho/absoluto/caso.json \
  --run-dir /caminho/novo/run-001 --resume-run --through-turn 5
```

A retomada usa o UUID da própria conversa, nunca `--last`. Não reexecuta turnos anteriores. Rejeita alterações de prompt/imagem já enviados, modelo, effort, guidance, versão do CLI, runner, bridge, arquivos MCP congelados ou dependências. Turnos futuros ficam somente no arquivo do caso, fora do cwd vazio apresentado ao modelo. O runner lê o caso para controle, mas manda ao CLI apenas o prompt atual e seus anexos.

Cada invocação grava um checkpoint novo: `report-001.json`, `report-002.json` etc. `manifest.json` e `turn-NN.json` não são sobrescritos. Só uma execução pausada pode ser retomada; uma falha não deve ser repetida silenciosamente, pois pode já ter consumido tokens ou produzido efeitos observáveis. Não execute dois coordenadores sobre o mesmo `run-dir` ao mesmo tempo.

## Evidências e limites

- `manifest.json`: modelo/effort configurados, flags efetivas solicitadas, versões observadas, plataforma e hashes.
- `mcp-snapshot/`: cópia de `dist/`, skills e manifests para congelar E0/E1 durante a trajetória. `node_modules` é compartilhado por symlink; seu hash integral é conferido na retomada. O manifest registra esse limite.
- `mcp.jsonl`: tráfego stdio local, com timestamp monotônico, PID, initialize, catálogo, chamadas e resultados. O catálogo deve ter exatamente as seis tools C2. O wrapper não substitui a execução da tool.
- `turn-NN.json`: prompt realmente enviado, hashes dos anexos, eventos JSONL do CLI, mensagens, stderr e wall-clock do processo.
- `report-NNN.json`: resultados, tokens de entrada/cache/saída/raciocínio, contexto observado no rollout próprio, auditoria de tools e checkpoint.
- `usage_cli` preserva os números de `turn.completed`; `usage_delta_from_rollout` subtrai totais cumulativos do próprio rollout para separar turnos. Campo ausente/regressão de contador vira `null`, nunca zero inventado. Tokens de raciocínio são uma categoria da saída; não devem ser somados novamente ao total como custo adicional.
- Modelo e effort observados vêm de `turn_context` no rollout recém-criado. `model_returned_by_provider` fica `null`: o CLI não expõe o identificador do modelo retornado pelo provider. Não equivale a captura HTTP da resposta nem prova do backend final.
- Os hashes de instruções correspondem ao material local que o Codex registrou. Não provam que todo o request ao provider foi capturado. O catálogo MCP completo é capturado; o catálogo exato dos builtins do modelo não é exposto por esta interface.
- Wall-clock por turno inclui inicialização do CLI, autenticação/routing, MCP e modelo; não mede latência de inferência isolada. Total por invocação exclui o intervalo de geração/espera entre checkpoints e a preparação do snapshot.

O runner solicita `--ignore-user-config`, `--ignore-rules`, sandbox `read-only`, approval `never`, web desativada, documentação de projeto zerada, catálogo automático de skills desativado e features pessoais desligadas. O cwd é temporário e vazio. O host de Code Mode permanece disponível porque este Codex precisa dele para MCP; a configuração é comum aos modelos. Usos observados fora das seis tools invalidam o run. Marcadores de catálogo pessoal, memória ou política pessoal encontrados nas instruções também invalidam o run. Ausência desses marcadores não é prova universal de ausência de qualquer texto pessoal; a limitação fica explícita.

O app-server instalado (`0.162.1`) rejeitou `--ignore-user-config`; o fallback escolhido é `exec`/`exec resume`. Isso exige persistência nativa da conversa no Codex e inicializa um novo processo/MCP por turno. Não usamos `--ephemeral`, não copiamos tokens e não apagamos sessões nativas. Ao pausar, preservamos o cwd vazio para a retomada; ao concluir, removemos somente esse diretório se continuar vazio. Timeouts interrompem exclusivamente o grupo de processos criado por aquela execução.

`probes/summary.json` contém somente o resumo sanitizado de três probes reais de conectividade: o primeiro revelou contaminação de catálogo de skills e indisponibilidade do MCP ao desligar Code Mode; os seguintes verificaram Terra e Astra com o catálogo correto. Não são resultados da matriz nem validação de qualidade. A retomada sequencial e anexos não foram exercitados com modelo dentro desse orçamento.

## Verificação sem modelo

```sh
python3 -m unittest discover \
  -s prototypes/compor-mcp/evals/model-efficiency/runtime -p 'test_*.py' -v
```

Os testes cobrem contrato sintético, exclusão de juiz, opções de isolamento, catálogo MCP inesperado, acesso somente ao rollout com UUID retornado, delta de tokens, timeout e pausa/retomada sem repetir etapas. Fixtures de processo não comprovam comportamento de um modelo.

A chave `skills.include_instructions` foi conferida no [schema oficial do Codex](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json) e seu efeito foi observado nos dois probes posteriores. As flags de execução e anexos foram conferidas no help do CLI instalado em 28/10/2026.
