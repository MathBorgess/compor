# Exploração: feedback durante a espera da imagem

Data: 17/11/2026. Base inspecionada: `0a8f8b8`. Escopo: relato de espera longa e falta de clareza entre uma imagem pendente e um erro. Alteração local, sem uso de chave real, fornecedor, dados de conta, push ou deployment.

## Evidência do código

O controlador `use-exploration-loop.ts` executa um POST por imagem, sequencialmente. Antes de cada POST consulta o gate e os sinais; o prompt é construído por código, sem um turno de Agents API nessa etapa. O handler confirma reserva, geração, armazenamento e conclusão antes de responder `completed`. Assim, a espera do navegador inclui mais etapas que a geração no fornecedor.

| Tempo | Função no código | Interpretação |
| --- | --- | --- |
| 5 segundos | Estabilização da seleção de referências | Regra de produto, anterior ao turno de análise da seleção |
| 15 segundos | `BATCH_DELAY_MS`, depois de três imagens | Regra de produto entre lotes; permanece visível e congelada durante pausa |
| 120 segundos | `AbortSignal.timeout` em `packages/images-api` | Limite da chamada ao fornecedor; não é estimativa de latência |
| 5 segundos | RPCs e leitura da lista no armazenamento | Limite por chamada, sem compor uma previsão de conclusão |
| 30 segundos | Upload/leitura do objeto de imagem | Limite por chamada de armazenamento |
| 300 segundos | `maxDuration` da rota de exploração | Configuração de execução da rota, sem prova do comportamento do ambiente real |

O POST no navegador não recebe progresso intermediário nem tem prazo próprio. Enquanto aguarda, não pode distinguir processamento remoto de perda de comunicação. O texto anterior era estático, sem posição no lote ou tempo decorrido; o status geral ficava abaixo da galeria e oculto na conversa. A ausência de resposta não comprova falha e não permite repetir a operação.

## Alteração

- O hook expõe apenas a identidade, posição e horário local do pedido pendente. O componente de apresentação mantém o relógio, sem renderizar todo o estúdio a cada segundo.
- O painel mostra “Aguardando imagem 1 de 3” antes das imagens, inclusive quando a conversa está aberta. O relógio usa `aria-live="off"`; mensagens de estado permanecem fora da região marcada como ocupada.
- A primeira imagem pendente deixa de aparecer junto do aviso de galeria vazia. O status estático duplicado da galeria foi removido.
- Aos 60 segundos, a mensagem informa espera longa e ausência de resultado. Esse limiar muda somente a mensagem; não é timeout nem promessa de duração.
- Uma resposta encerra o relógio. A imagem seguinte começa em zero; resultados desconhecidos e retomada mantêm a reconciliação anterior, sem reenvio automático.

Não mudam os lotes, intervalos, geração sequencial, autorização, reservas, persistência ou contrato HTTP. O ajuste não reduz a duração real da geração.

## Validação local

Ambiente observado: Codex, Darwin 27.2.0 arm64, Node 24.16.0, Chrome 157.0.8103.79. O modelo executante não foi inferido do pedido. SHA-256 do `AGENTS.md` local aplicado: `8c3b24688e08cb2478d35a12e914b29c51cc8c1fa4321be78f57e57e2e5c95e5`. O trabalho também seguiu o contrato pessoal fornecido no chat, instalado a partir da revisão `3b095b1e008e6bfd6af49351b12af544c3c295cc`.

- A fixture de `exploration-progress-browser.test.mjs` reteve a resposta HTTP: os dois cenários novos falharam antes do patch e passaram depois, em 1440×1024 e 390×844.
- Com relógio virtual, os cenários conferem espera de 65 segundos, mensagem prolongada, visibilidade na conversa, posição 2/3 com relógio reiniciado e ausência de overflow horizontal.
- O mesmo cenário retorna `unknown`, avança mais dois minutos e pede retomada: o marcador permanece, o relógio encerra e nenhum terceiro POST é enviado. As rotas são simuladas; não há chamada paga.
- A execução direcionada passou 17 testes, sem skips: progresso, lotes e intervalo, coordenação entre abas, recarga, desconexão, pergunta da seleção, preflight, recusa e galeria em cinco viewports. Após o ajuste do estado vazio, os sete cenários de progresso e galeria também passaram novamente.
- `quality:lint`, `quality:typecheck`, `quality:test` (60 testes) e `quality:build` passaram.
- Um rebuild após os testes Next diretos encontrou tipos antigos de uma fixture removida em `.next/dev/types`. A remoção desse cache gerado e inativo permitiu repetir o build e a checagem de tipos; não foi alterado código para contornar o erro.
- A suíte completa de navegador foi interrompida de forma controlada para ser executada uma única vez no head integrado. Testes direcionados e resultado integrado são evidências distintas.

Complemento após revisão independente: os testes anteriores verificavam pausa entre lotes e troca de IA no chat, sem exercer o novo indicador durante um POST de exploração pendente. A fixture agora cobre a troca entre Pinterest, upload e propostas sem reiniciar o relógio nem enviar outra imagem; pausa e troca de BYOK para IA do Compor encerram o indicador, preservam o marcador e bloqueiam reenvio. Retomada enquanto o recibo continua `running` e resposta tardia da chamada interrompida também não geram outro POST. Os quatro cenários de `exploration-progress-browser.test.mjs` passaram, sem skips, com serviços simulados e relógio virtual. Este complemento altera somente teste e documentação.

Não foram medidos latência, faturamento, processamento remoto ou ansiedade de pessoas em produção. Os testes comprovam apresentação e preservação da sequência com serviços simulados. A avaliação final de clareza continua sendo humana.
