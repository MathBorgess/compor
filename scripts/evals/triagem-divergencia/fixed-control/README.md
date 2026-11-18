# Controle complementar de ablação da referência

O controle compara o mesmo prompt e os mesmos anexos em duas chamadas, removendo somente a referência opcional de uma das chamadas. Ele mede a contribuição dos bytes quando se usa a triagem do planejamento original. As artes resultantes usam uma proposta do dataset. A qualidade artística do texto escrito pelo planejador exige uma comparação separada.

O protocolo fixa a posição 1 do único trio com rótulo de origem `accept` que já constava do corpus por caso. O rótulo escolhe a fonte congelada e fica fora do pacote do juiz. A seleção de arquivos vem do plano real da rodada zero no braço com a referência opcional. O guarda confirma essa saída contra o pedido e o resultado do recibo SQLite e recompõe o prompt com os fatos declarados. Se o texto da posição 1 coincidir com um prompt do planejamento original para o mesmo caso, o resultado fica retido.

O mesmo juiz J2 recebe cinco fichas cegas em uma única sessão via login ChatGPT. Para cada trio, ele vê a direção, o catálogo autorizado, a subsequência efetivamente retida e as três opções. Aplica o critério habitual por slot e por par. Se o trio for admitido e o plano original retiver a referência opcional, o executor pode usar exclusivamente a posição 1. Nos demais casos, registra o motivo e encerra o caso. O teto deste controle é de cinco pares dentro das 60 imagens já autorizadas para o estudo.

```sh
node scripts/evals/triagem-divergencia/fixed-control/guard.mjs "$EVIDENCIAS" --prepare
node scripts/evals/triagem-divergencia/fixed-control/guard.mjs "$EVIDENCIAS"
node --test scripts/evals/triagem-divergencia/fixed-control/guard.test.mjs
```

A primeira execução grava o protocolo, os digests de origem e o pacote cego em `fixed-control-r0/`. O resultado de cada caso fica em `fixed-control-r0/<caseId>.json`. Antes de gastar, o executor deve chamar `verifyFixedAdmission(raiz, caseId)`, conferir `decision === 'admit'` e usar `plan.items[0].prompt` nos dois braços. Essa verificação local reaplica o juiz ao recibo existente e coteja o arquivo, as fontes, os bytes congelados, a seleção, o protocolo e o planejamento da rodada zero.

Na execução de R0, as cinco fichas tiveram o recibo verificado e nenhuma satisfez todas as condições. Portanto este controle produziu zero pares e o efeito visual da retirada da referência ficou sem observação. Em desenvolvimento, Concerto já havia omitido a referência opcional. No primeiro prompt de Feira, o juiz apontou a falta de instrução para limitar as cores do cartão ao fundo e à tipografia e excluir as barras. No de Troca, faltaram os vínculos com as posições esquerda e direita pedidas para o fundo. Esses dois diagnósticos descrevem os prompts congelados do controle.
