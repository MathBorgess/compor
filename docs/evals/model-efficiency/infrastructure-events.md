# Ocorrências do coordenador

## Retomada com intérprete diferente — antes de T4

O primeiro lançamento de `run_followups.py` usou o Python com Pillow também para o runner. Isso mudava o caminho do processo MCP em relação ao manifest inicial. O runner recusou os seis runs `r1-mentoria-*` com `Runner configuration changed since the checkpoint`, antes de iniciar qualquer turno do modelo. Não foram criados `turn-04.json` ou novos checkpoints nessas tentativas; a execução permaneceu pausada em T3.

Correção: o coordenador lê do manifest o mesmo intérprete usado originalmente no runner; continua usando o Python com Pillow somente no compositor. Não houve mudança no runner congelado, nas condições E0/E1, nos prompts ou na história nativa. A ocorrência é falha de orquestração, não evidência contra nenhum modelo. A saída do processo foi observada na sessão local `85916` (encerrada), antes do novo lançamento corrigido.

## Recuperação por destinos novos — após T4 (2026-10-28)

O coordenador relatou um falso bloqueio de infraestrutura em Terra E0 T4: o extrator recusou duas alternativas com o mesmo `piece_id` e versões distintas. A correção desse contrato do extrator é independente da resposta do modelo. A tentativa bloqueada deve permanecer como evidência; sua recuperação reutiliza o `turn-04.json` existente, sem nova chamada ao modelo para T4.

O helper `advance.py` passou a aceitar `--artifact-dir`, `--report-path` e `--resume-path` para gravar a recuperação em destinos novos, por exemplo `t4-artifacts-a2`, `advance-t4-a2.json` e `resume-after-t4-a2.json`. `--previous-artifacts` permite que T5 confira continuidade de ativos contra a extração corrigida de T4. Sem essas flags, os destinos anteriores permanecem iguais. Relatórios e diretórios de tentativas falhas não são sobrescritos.

A alteração é de coordenação técnica: não acrescenta instruções criativas nem altera prompts já enviados, copy, layout ou ativos. O relatório da nova tentativa registra os destinos explícitos, o hash do relatório anterior selecionado e os hashes efetivos de coordenador, extrator e renderer. O próximo turno continua recebendo apenas resultados técnicos e os anexos produzidos no mesmo fluxo.

Verificação: sete testes sintéticos passaram com o renderer real. O teste de recuperação mantém byte a byte os três arquivos da tentativa anterior, compõe T4 em destinos novos e resolve T5 pelo `--previous-artifacts` correto. Nenhum run existente foi alterado para executar esse teste; não houve chamada de modelo ou geração de ativo.

Hashes após esta correção:

- `advance.py`: `31552c3b6cf4027172a04d006947a16bbeff3273f6a21f606b2ac55c0094843f`.
- `test_advance.py`: `3b64fbf02494a87969325890e3c3d62989c6028c58f0e90213889528c2f3ff02`.

A recuperação de um run real deve ser registrada pelo coordenador separadamente; os testes de infraestrutura não demonstram sua execução.

## Fechamento da triagem low e início de medium

A recuperação real de `r1-mentoria-terra-E0` produziu `t4-artifacts-a2`, `advance-t4-a2.json` e `resume-after-t4-a2.json`; T5 usou essa origem explicitamente e concluiu. A tentativa original permanece preservada.

`r1-mentoria-astra-E0` falhou em T4 com “Selected model is at capacity”, sem mensagem do agente nem uso informado; T5 não foi executado. `r1-startup-sol-E1` concluiu a resposta de T5, mas o compositor recusou overflow de texto. O plano e o relatório falho foram preservados; não existe PNG da revisão, nem houve ajuste silencioso.

Na rodada medium, `m1-mentoria-sol-E0` falhou em T2 por capacidade do serviço, depois de T1 bem-sucedido. O lote parou; os IDs seguintes foram lançados explicitamente a partir da ordem 3, sem repetir ou sobrescrever a tentativa falha. Infraestrutura indisponível não demonstra insuficiência do modelo nem custo zero.

## Revisão dos helpers e disponibilidade em medium

`m1-startup-sol-E1` falhou em T5 com “Selected model is at capacity”, sem `turn.completed`; T3/T4 e seus renders permanecem válidos. Não atribuir consumo zero ou defeito criativo a essa tentativa indisponível.

Antes dos pacotes medium, `blind_pack.py` foi corrigido para validar a cadeia entre extrações e a proveniência dos PNGs. A versão usada em round1 foi preservada em `coordinator-revisions/blind_pack.before_review.py`; sua auditoria separada encontrou 0 divergências nos 56 PNGs existentes. O freeze original permanece histórico. Esta mudança não afeta inputs, planos, renderização ou notas: impede apenas um pacote incoerente ser apresentado aos avaliadores. Ver `code-review.md` para hashes e regressões.

`m1-startup-terra-E1` concluiu resposta T5, mas o renderer recusou overflow. O plano e a falha permanecem; não existe PNG da revisão. Essa é falha de composição, separada das duas indisponibilidades observadas em medium.
