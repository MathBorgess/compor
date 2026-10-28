# Bridge MCP para ensaios sintéticos

O bridge lista schemas e chama tools pelo protocolo MCP em memória. Cada comando abre uma conexão nova e fecha-a ao terminar; não inicia modelo, subprocesso, serviço de rede, consulta de credenciais ou persistência do produto. A escrita local de JSONL é intencional. `--synthetic` registra a declaração do operador, não verifica a origem dos dados; use exclusivamente fixtures fictícias, sem conteúdo de usuário ou segredos.

Na pasta `prototypes/compor-mcp`, depois de `npm run build`:

```sh
node evals/bridge.mjs --synthetic --run h0-case01 --dir /tmp/compor-eval-runs list
node evals/bridge.mjs --synthetic --run h0-case01 --dir /tmp/compor-eval-runs call load_skill '{"id":"entender-intencao"}'
node evals/bridge.mjs --synthetic --run h0-case01 --dir /tmp/compor-eval-runs call prepare_word_cloud - <<'JSON'
{"words":[{"word":"calma","frequency":2,"chosen_weight":0}]}
JSON
```

O caminho de log é `<dir>/<run>.jsonl`; IDs aceitam letras, números, `_` e `-`, com até 64 caracteres. Reusar um ID acrescenta linhas, não substitui uma execução; usar IDs separados por candidato/caso/replicação. Cada linha contém UUID próprio, horários, tempo total do comando, inputs (inclusive texto bruto de JSON inválido), saídas, erros, hashes do servidor compilado, lockfile, catálogo, schema da tool e resultado quando disponíveis. O conteúdo carregado de uma skill inclui seu hash na resposta da tool. O hash de fonte não substitui o hash do código compilado realmente executado; reconstruir após alterar fontes.

Saída padrão é um único registro JSON, também anexado ao log. Códigos de saída: `0` para resposta MCP sem `isError`; `2` para resposta MCP com `isError`; `1` para erro de parsing/bridge/protocolo, limpeza ou gravação do transcript. Não tratar `0` como êxito da tarefa ou aprovação de preferência. Um erro anterior à configuração de `--dir`/`--run` aparece só em stdout. Uma falha de gravação mantém o resultado observado no stdout e informa `transcript_error`.

O bridge não escolhe a próxima tool nem avalia o resultado. Um subagente real pode escolher chamadas e produzir uma resposta final; essa sessão deve registrar separadamente modelo observável, instrução candidata, caso e resposta, sem acesso ao gabarito. Uma sequência fixa de shell mede protocolo/contrato e não deve ser descrita como decisão autônoma de LLM. `fetch` é bloqueado como defesa de teste; não é sandbox de rede do sistema operacional. A presença de tools não comprova autenticação, isolamento, memória, geração ou benefícios ao usuário.
