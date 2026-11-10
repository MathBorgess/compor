# Suíte web paralela — primeira validação no CI

Medições consultadas em 09/11/2026, no horário de Recife. O PR [#36](https://github.com/MathBorgess/compor/pull/36), head `c5e6174`, foi integrado em `22ff011` depois do **Quality gate** verde.

| Execução | Modo | Head do PR | Testes aprovados | Suíte (s) | Janela dos logs do job web (s) |
| --- | --- | --- | --- | --- | --- |
| [41 / PR #30](https://github.com/MathBorgess/compor/actions/runs/42722139689) | Série, aprovada | `c2c4f6c` | 285/285 | 720,77 | 756,38 |
| [44 / PR #35](https://github.com/MathBorgess/compor/actions/runs/42729622747) | Série, aprovada | `6a1cd83` | 287/287 | 872,14 | 914,65 |
| [45 / PR #36](https://github.com/MathBorgess/compor/actions/runs/42733753252) | Paralela, reprovada | `bc9c391` | 283/290 | 513,32 | 545,68 |
| [46 / PR #36](https://github.com/MathBorgess/compor/actions/runs/42738742421) | Paralela, aprovada | `c5e6174` | 295/295 | 475,66 | 519,07 |

O tempo da suíte vem de `duration_ms`, emitido pelo `node:test`. A janela do job é a diferença entre o primeiro e o último timestamp dos logs, incluindo preparo e encerramento; não é o campo de duração da API nem uma medição de faturamento. Os jobs web são `129518803024`, `129544736342`, `129558259917` e `129574599042`, na ordem da tabela. Nenhum teste de navegador foi pulado.

A janela observada do job aprovado ficou 43,25% menor que a execução serial 44 e 31,37% menor que a 41. As versões e quantidades de testes diferem, e há uma única execução paralela aprovada. Isso não é uma comparação causal controlada nem uma nova mediana. A execução reprovada não serve como benchmark de sucesso.

## Falha investigada e correção

A execução 45 teve sete timeouts de 6 s em `openProject` de `brief-interview-browser.test.mjs`, todos em `page.goto`. O preflight sem cookie confirmava o HTTP 200 da entrada leve do ADR 0034, antes de verificar a rota autenticada do App Router.

O commit `c5e6174` prepara a rota com o mesmo cookie sintético do navegador, consome o HTML e os scripts e estilos da mesma origem, e não segue redirects. O prazo de startup permanece em 30 s, com até 2 s por requisição; os limites de 6 s das ações e o padrão de 90 s por teste não mudam. As requisições de uma tentativa terminam antes de uma nova tentativa. O JavaScript carregado no preparo não é executado.

Os logs foram lidos antes da mudança. Não houve repetição manual do commit reprovado: a execução 46 foi disparada pelo novo commit. O runner também passou a recusar descoberta vazia; probes de suíte vazia, fixture reprovada e fixture aprovada retornaram códigos 1, 1 e 0.

## Verificação local

Em Linux, com afinidade de dois CPUs e caches do Next frios, o par de arquivos anterior à correção passou 16/16 em 131,74 s; a falha do CI não foi reproduzida nesse host. Depois da correção do preparo, os pares passaram 16/16 em 130,51 s e 17/17 em 105,34 s. Os sete contratos do helper cobriram cookie, HTML completo, entrada leve insuficiente, recursos externos, corpo ou chunk incompleto e término da onda de requisições antes de repetir.

Lint, tipos e os 20 testes dos scripts de qualidade passaram. A validação usa serviços simulados; não houve deploy, autenticação real ou chamada paga. Orçamentos de produção e limites dos jobs permaneceram iguais.
