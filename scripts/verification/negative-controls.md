# Controles negativos de integridade

`captureNegativeControls(runDir, { goal, anchors })` exige um G01 aprovado pelo
avaliador e âncoras externas `expectedGoalDigest`, `expectedSuiteDigest`,
`expectedAppRevision`, `expectedSnapshotDigest` e `expectedRunId`.

O módulo preserva os arquivos originais e cria quatro cópias independentes em
um novo subdiretório `negative-controls-*`:

- **missing-artifact:** remove o arquivo `generated-image` declarado pelo manifesto.
- **corrupt-bytes:** acrescenta bytes à imagem sem alterar o hash esperado.
- **stale-snapshot:** altera o digest de snapshot do manifesto, mantendo a âncora externa.
- **missing-manifest:** remove o manifesto inteiro.

Cada cópia usa o mesmo goal e avaliador. Todas precisam retornar `passed:false`;
se uma for aceita, o módulo grava os relatórios e lança erro. `receipt.json`
registra qual falha foi detectada, os diagnósticos e os caminhos dos relatórios.
O `passed:true` desse recibo significa que os quatro defeitos foram detectados.

Esses controles verificam a rejeição de evidência incompleta, corrompida ou de
outro snapshot. Não executam outro fluxo de produto nem provam a detecção de
uma gravação omitida no banco. Esse controle exige uma execução separada do
cenário com a falha correspondente injetada.
