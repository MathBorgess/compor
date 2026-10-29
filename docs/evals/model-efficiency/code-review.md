# Revisão de código — preparação do PR #9

28/10/2026. Escopo: diff de `src/guidance.ts`, `server.ts` e `stdio.ts` desde `7773b26`, além de `artifacts.py`, `advance.py`, `blind_pack.py`, `record_asset.py`, `run_planning.py` e `run_followups.py`. Revisão inicial em `a398de64b0e21346c57982dab79fca7c8845d18c`. Não foram consultadas notas de Judges nesta revisão. Nenhum modelo ou gerador de imagem foi chamado.

**Resultado:** dois defeitos acionáveis identificados. A montagem do pacote cego foi corrigida após autorização do coordenador; o status de saída de `run_followups.py` foi corrigido ao encerrar as execuções, conforme adendo abaixo. A auditoria separada não encontrou divergência nas cadeias/pixels dos pacotes round1 existentes.

## P2 — wrapper retorna sucesso após falha de uma etapa

**Aberto no hash revisado.** [run_followups.py](../../../prototypes/compor-mcp/evals/model-efficiency/run_followups.py), linhas 35–42: quando runner ou `advance` retorna erro, o script imprime `stage_failed` e executa apenas `break` no loop interno. Ao terminar o arquivo, o processo retorna 0. Assim, um consumidor que confia no exit code pode tratar um lote com T4/T5 ausentes como execução bem-sucedida.

Reprodução isolada com a fonte original em diretório temporário, schedule/manifest sintéticos e `subprocess.run` mockado; nenhum subprocesso real do modelo foi iniciado:

| Resposta simulada dos filhos | Evento emitido | Saída do wrapper |
|---|---|---:|
| Runner T4 retorna 7 | `model_t4` falhou | 0 |
| Runner T4 retorna 0; advance retorna 9 | `artifacts_t4` falhou | 0 |

Correção recomendada: acumular ou propagar o erro e encerrar com código não zero se alguma etapa falhar. Pode preservar a decisão de continuar outros runs, mas isso não deve apagar o resultado do lote. Cobrir falha do runner, falha do coordenador e sucesso integral. Nenhum checkpoint ou resultado já produzido deve ser reescrito.

SHA-256 revisado de `run_followups.py`: `17b6782f369e97918dcf22f8fde598e59e0d57bf2b09d67cfd398d65488cc121`. A correção foi adiada por instrução do coordenador para preservar o wrapper durante o lote ativo; registrar hash posterior e testes quando aplicada. Os relatórios individuais conservam a falha: este achado não prova alteração das contagens de resultados existentes.

## P2 — seleção independente podia misturar cadeias entre etapas

**Corrigido no montador; pacotes existentes preservados.** Na [versão anterior de blind_pack.py](../../../prototypes/compor-mcp/evals/model-efficiency/coordinator-revisions/blind_pack.before_review.py), linhas 36–43, cada turno selecionava independentemente a pasta lexicalmente maior com `status=ready_for_render`, ignorando `report.previous`.

Reprodução sintética: criar cadeia T3-A → T4-A → T5-A e depois uma extração T3-B em `t3-artifacts-a2`, com outro ativo. O montador anterior concluía um pacote B/T3 + A/T4 + A/T5 com `missing=false`, sem limitação. Isso permite avaliar variações/revisões contra uma direção diferente daquela recebida pelo candidato. A fixture também demonstrou aceitação de PNG sem relatório/metadados do renderer: o hash dos pixels copiados identificava o arquivo, mas não comprovava vínculo com o plano.

A [correção](../../../prototypes/compor-mcp/evals/model-efficiency/blind_pack.py) valida identidade do run/turno e `previous.path + sha256` antes de criar saída. Divergência falha explicitamente; não escolhe outra cadeia silenciosamente. Para PNG existente, confere hashes do render input, peça mapeada e ativos e reutiliza `advance.verify_render`, incluindo metadados, fontes, política e runtime. O hash da cópia é conferido novamente. CLI e mapa de rótulos permanecem compatíveis; nenhuma geração é adicionada.

- Backup byte-idêntico / antes: `e6840a0213c674cfb1bd3fad583abc09ad1c06f5504bac746fa3b3a31b147cb6`.
- `blind_pack.py` corrigido: `2d1f0bd8852fd7d81a1a1d0d6e893122fc9fe1aad525e5657a1d08d11e8dc85b`.
- Oito [regressões sintéticas](../../../prototypes/compor-mcp/evals/model-efficiency/test_blind_pack.py): cadeia válida, bifurcação, hash anterior divergente, pai ausente, PNG alterado, relatório ausente, input alterado e etapas ausentes. Outputs existentes são preservados.

## Auditoria dos pacotes já produzidos

A [auditoria de linhagem separada](code-review-lineage-audit.json) examinou os dois mapas round1 sem ler notas de Judges ou reexecutar os planos:

- **12 pacotes; 56 PNGs disponíveis:** cópias conferem byte a byte com as fontes selecionadas, hashes de pixels conferem, e relatórios/metadados de render passam pela verificação existente.
- **Zero divergências** nos vínculos `previous.path + sha256` entre as etapas selecionadas.
- Duas etapas sem extração pronta e um artefato sem PNG estão sinalizados como ausentes. Ausência não virou nota nem sucesso.

Os pacotes antigos não gravavam o caminho da extração selecionada. A auditoria reconstrói a seleção pelo algoritmo preservado e verifica os arquivos atuais; não equivale a um manifesto original da execução do seletor. Pacotes, mapas, PNGs e relatórios históricos não foram modificados.

SHA-256 do arquivo de auditoria: `8c7660d4a78b359ca7373d564ea8afcb8047cd20db03a97dc34fe81678e8b49b`.

## Verificação e limites

- **31/31 testes MCP** passaram com `node --test test/mcp.test.mjs test/guidance.test.mjs`. Catálogo baseline mantém o hash do PR #8; E1 modifica descrições/exemplos, e os testes de entradas válidas/inválidas mantêm saídas idênticas. A revisão do diff não identificou mudança de callbacks ou validação. O stdio rejeita variante desconhecida antes do handshake.
- **36/36 testes Python** passaram: 21 de extração, 7 de continuação e 8 novos de montagem cega. São fixtures locais sintéticas, incluindo composições geométricas de teste; não há execução de modelos ou geração de campanha.
- Não houve outro achado de alta confiança em extração, registro de ativos, continuação ou planejamento no escopo examinado. Isso não é certificação geral. Métricas agregadas, execução real do provedor, qualidade criativa e consentimento de produção não foram auditados aqui.
- Runner e renderer congelados, inputs dos candidatos e evidências existentes permaneceram intactos. Alterações autorizadas desta revisão: montador standalone, seu backup/testes e os dois relatórios de revisão.

## Adendo de fechamento — código de saída corrigido

Após o encerramento de todos os processos nativos, o coordenador preservou a versão anterior em `coordinator-revisions/run_followups.before_review.py` e passou a acumular falhas no lote. O wrapper continua os runs independentes, mas retorna 1 se runner ou compositor falhar; sucesso integral retorna 0. Nenhuma trajetória foi repetida por esta correção e os resultados individuais permanecem originais.

Quatro regressões com subprocessos simulados passaram: lote integral, runner falho seguido de sucesso, compositor falho seguido de sucesso e recusa antes de enviar turno já existente. Os dois P2 desta revisão estão corrigidos.

SHA-256 final de `run_followups.py`: `24d1b62abc1f01fdd79343b4148c37cf80d8f69a4d29ab36bbc968a850fe5f98`.
