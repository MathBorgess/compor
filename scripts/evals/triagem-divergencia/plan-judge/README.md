# Juízes de plano antes das imagens

A bancada usa cinco briefings por braço. Um juiz examina somente o contexto e os três prompts para decidir se há escolha visual discernível. Outro avalia a leitura das referências com os mesmos arquivos sintéticos oferecidos ao planejador e o gabarito da bancada. Cada grupo usa uma sessão independente do Codex CLI autenticado com ChatGPT, sem chave de API no ambiente do processo. A rotina de preparação funciona offline com Node, Python 3 e Pillow.

Na raiz do repositório, os comandos abaixo preparam os controles e as fichas da rodada zero. O diretório de ensaio deve conter um arquivo `round-0/<caso>/<with|without>/plan.json` para cada caso e braço.

```sh
node scripts/evals/triagem-divergencia/plan-judge/controls.mjs "$ensaio" --prepare
node scripts/evals/triagem-divergencia/plan-judge/round.mjs "$ensaio" 0 --prepare
```

Omitir `--prepare` inicia as sessões. Cada reexecução reutiliza um parecer concluído cujo pacote e resposta tenham os hashes registrados. O registro de uma sessão iniciada sem resposta verificada interrompe a execução daquele grupo e preserva os eventos para inspeção. Um plano inválido é uma abstenção do caso e produz uma retenção antes de imagens. As entradas sintéticas compartilhadas de um mesmo caso continuam reconhecíveis por seu conteúdo. O juiz de triagem consegue distinguir a presença de leituras declaradas, requisito da avaliação. Os caminhos de arquivos visíveis ao modelo são aleatórios e omitem rodada e braço.

Cada `review.json` contém `subject`, `decision` e o parecer `critique`. O vínculo cobre o contexto, os textos das três propostas e os IDs efetivamente incluídos. A admissão exige direção preservada nos três prompts e, para os três pares, tanto mecanismos de contraste diferentes quanto escolhas distintas de foco, estrutura ou percurso. O sistema confere presença das citações no texto efetivo de cada proposta. O juiz lê os rótulos de composição e contraste para conferir se essas declarações se sustentam no texto que o gerador receberá. Uma geração de imagem ainda depende de intenção, autorizações, reservas e validações de bytes e de manifesto do executor.

Cada `triage-judgment.json` separa acerto da escolha do arquivo, captura da intenção, identificação da característica e especificação de uso no prompt. O gabarito entra só nesta segunda avaliação. Notas ausentes por falta de atribuição ficam nulas e têm cobertura própria. Um plano recusado não ganha pontos. As medidas sobre os pixels da arte e custo por arte utilizável exigem a etapa posterior de geração e avaliação.

A rodada escreve os casos de desenvolvimento para revisão em `plan-feedback-dev.json`. Os casos de reserva permanecem em `plan-panel-private/plan-feedback-holdout.json`. Controles de calibração também separam resultados de desenvolvimento e reserva. Para avaliar o reconhecimento de paráfrases olhe o diagnóstico do par, as retenções incorretas de propostas válidas, as abstenções e a cobertura. Somente uma escolha do criador mede a utilidade da divergência para a decisão pessoal.

## Possível integração após avaliação

O produto valida o plano e emite uma prova assinada em `packages/agents-api/src/exploration-planner.mjs`. O coordenador de `apps/web/lib/exploration-batch-route.ts` recebe essa prova antes de reservar o lote. A candidata separa as leituras de referência do JSON v2 de geração. Uma promoção futura precisa conferir a correspondência entre leituras, seleção, plano e intenção antes de emitir a prova para novos pedidos. Uma consulta de recibo existente deve poder recuperar sua decisão original. Um parecer sem resposta é uma pendência com identidade própria. Para usar um novo serviço de julgamento em produção, registrar seu custo, a autorização e a forma de recuperar o mesmo parecer antes de introduzir outra chamada externa. O CLI desta bancada pertence ao ensaio.

A ideia de contrastar exemplos e alternativas vem da metodologia já portada no pacote [agile-deliberation](../../../../packages/agile-deliberation/src/methodology.js). O criador conserva a palavra final sobre as três opções. Consulte o [contrato existente para referências e triagem](../../../../docs/adr/0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) para a seleção dos arquivos.
