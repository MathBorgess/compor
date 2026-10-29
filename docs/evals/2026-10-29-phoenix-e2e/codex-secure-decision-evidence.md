# Codex com chave isolada: tentativa de busca Decision

Registro local de 29/10/2026. Objetivo: testar um turno real do Codex que acione uma única descoberta MCP, com briefing fictício e autorização de pesquisa, modelo e envio de miniaturas, mantendo a chave fora do processo Codex e de seus argumentos e arquivos.

Um broker local atende um socket Unix com diretório `0700` e socket `0600`; o host MCP recebe a credencial por pipe anônimo e a passa diretamente ao cliente OpenAI em memória. Ele não insere a chave em `process.env`. O broker restringe a operação a uma chamada e aos argumentos e consentimentos esperados; saídas que contenham a chave são bloqueadas. O sandbox aplicado ao Codex bloqueia o acesso testado por `pbpaste` e o envio de Apple Events. O teste não altera a área de transferência.

## Isolamento observado

O [pré-teste com credencial fictícia](codex-sandbox-synthetic-key-preflight-v6.json) executou um turno real do Codex e chamou `list_skills`. O cliente MCP filho confirmou clipboard bloqueado e ausência da chave no ambiente. Um controle positivo mostrou que `kern.procargs2` lê uma credencial fictícia passada no ambiente inicial; o valor fornecido por pipe ao host MCP não apareceu nessa leitura. No teste, `task_for_pid` para processo irmão foi negado; a credencial fictícia não apareceu nas respostas normais ou de erro do MCP, nem no ambiente de um subprocesso. São verificações limitadas, não uma prova de que toda rota de acesso no macOS está bloqueada.

A primeira política experimental, que negava `process-info`, interrompeu o Codex por sinal 5; ela não bloqueou a leitura de `kern.procargs2`. A [falha foi preservada](codex-sandbox-synthetic-key-preflight.json). Outra execução do pré-teste não chamou a ferramenta esperada e foi preservada como falha; não foi interpretada como sucesso.

## Resultado do turno Decision

No [turno com a credencial autorizada](codex-secure-decision-live-v3.json), o modelo tentou chamar `discover_visual_references`, mas o Codex recusou a ação antes que ela alcançasse o broker: `MCP tool call requires approval, but approval policy is never`. **Nenhuma busca nem chamada à Decision API ocorreu nesse turno.** As tentativas anteriores com o mesmo arranjo também estão preservadas; não afirmam sucesso. A chave não foi devolvida ao cliente nem colocada em registros, e a política de aprovação não foi contornada.

O teste usou cota da autenticação ChatGPT; o registro contém uso reportado, não valor de cobrança. A experiência real de Codex acionando uma busca externa Decision continua sem prova. O [experimento local anterior](reunioes-decision-evidence.json) com o cliente MCP direto continua evidência de pontuação Decision, mas não de um turno autônomo do Codex.
