# Evidência revisável da issue 51

Pacote sintético da rodada local de 16/11/2026, repetida após o rebase para
a preparação da PR. Ele permite reavaliar os
artefatos preservados com Node, sem Docker, banco, instalação npm ou rede.
Reavaliar evidências não executa novamente o produto. As medições e os limites
da rodada estão no [relatório do spike](../../goals-spike-2026-11-16.md).

Na raiz do repositório, com Node 22.13.1 ou posterior:

```sh
node docs/quality/evidence/issue-51-2026-11-16/re-evaluate.mjs
```

O comando é somente leitura. Confere todos os arquivos contra
`files.sha256.json`, carrega a cópia exata do avaliador executado e compara os
vereditos, integridade, conclusão e estados por critério/check com os
relatórios preservados. Erro de hash, arquivo ausente, cenário omitido ou
resultado divergente termina com código diferente de zero. A saída esperada
é `status: verified`, com os resultados abaixo; isso não transforma os casos
negativos ou a exploração parcial em Goals atendidos.

| Papel | Run | Resultado esperado |
| --- | --- | --- |
| Positiva | `37652b38-df59-42cb-9c88-b64501844bb0` | G01/G02/G03 atendidos: 12 critérios, 66 checks |
| Replay | `a4406ee2-42d1-40f7-8e1a-34c9d98060df` | Mesmo resultado; nova execução do snapshot |
| Persistência omitida | `1b92ecbb-b60c-4f4c-94dc-426b219b3b7f` | G01 violado, `passed: false` |
| Exploração externa | `aecdb7ae-b3ef-43a3-b667-2d56eade3b29` | G01 inconclusivo por cobertura parcial, `passed: false` |

Na positiva, os quatro controles adicionais de arquivo ausente, bytes
corrompidos, snapshot divergente e manifesto ausente também precisam retornar
`passed: false`. Os arquivos faltantes são deliberados nessas cópias e estão
fora do inventário; não devem ser restaurados para tentar fazer o Goal passar.

## Conteúdo e procedência

- `runs/<id>/`: manifestos, observações e arquivos declarados, avaliações,
  resumo, preflight, inventário de migrations e recibos de encerramento.
- `runs/<positiva>/G01/negative-controls-bcavru/`: as quatro cópias defeituosas,
  seus relatórios e recibo. A evidência positiva original permanece separada.
- `runs/<exploração>/external-agent-demo.json`: as 16 respostas do protocolo
  dirigidas pelo cliente externo, incluindo revisão antiga recusada.
- `evaluator/` e `goals/`: bytes exatos de `evaluate.mjs`, `contracts.mjs` e dos
  três Goals presentes nas âncoras da execução. Não são versões editadas para
  aceitar os resultados.
- `provenance.json`: caminhos relativos de origem, hashes originais e
  empacotados, transformações declaradas e referências por cenário.
- `files.sha256.json`: lista completa e tamanhos/hashes de todos os outros
  arquivos do pacote, incluindo este README e o utilitário de reavaliação.

Manifestos, observações e arquivos declarados foram copiados byte a byte.
As avaliações normais também são cópias exatas. Somente três arquivos de
diagnóstico dos controles negativos tiveram o prefixo absoluto do diretório
de evidências do host substituído por `<local-evidence>/`: o recibo e os dois
relatórios de arquivo/manifesto ausente. `provenance.json` registra hash de
origem e hash resultante para cada transformação. O utilitário compara as
decisões e os estados dos checks, pois um erro de filesystem contém o caminho
do host que está reavaliando.

Cada `anchor.json` conserva os campos da âncora original, exceto a lista
completa de fontes. O hash da âncora original e os registros de origem dos
cinco arquivos de Goals/avaliador estão na proveniência. O pacote não contém
o snapshot completo do app, imagem Docker, logs brutos, ambiente, cookies,
chaves ou credenciais. Os usuários, projetos, textos e imagens são sintéticos.

## Significado das âncoras

As execuções referem-se ao código do commit
`6c7775d198fcd2b78e720a4ac3ca525b0958ff69`, reaplicado sobre
`c6346ebd7c7418550dd81115cb51d116cb2d0cb6`, e às fontes capturadas no
snapshot `1155e65fb92c92265c93d8e4e9ed1a7e8bdf78f7f6213c65e3464c727e88126f`.
A suíte executada foi
`a154dae2c35079bbd1619319d58116af82c261d3902e8b92c9b8e6b7af9957c4` e a imagem
foi `sha256:437763fd49033df83b4da6b2dc6e5e7d803b04bcced79a76d08710f28f4d1be4`.
Esta é uma nova rodada: as âncoras do pacote anterior não foram reescritas
para atribuir seus resultados ao código após o rebase. A suíte e os critérios
permaneceram iguais. O pacote anterior e os runs originais estão preservados
localmente; o relatório mantém o histórico. O commit documental que vier a
versionar este pacote não foi retroativamente executado.

Os valores esperados vêm dos recibos locais do supervisor e dos Goals fixados
naquela rodada. São evidências de procedência declarada, sem assinatura ou
autoridade externa independente. Hashes detectam alteração em relação ao
inventário apresentado; quem controla o checkout pode alterar ambos. O
utilitário acrescentado para esta publicação é uma ferramenta de auditoria
do pacote, não parte da suíte histórica. A revisão deve conferir essas
limitações antes de usar o resultado como critério de aprovação.

O pacote demonstra avaliações locais do perfil offline. Não comprova CI,
deploy, Supabase gerenciado, qualidade criativa, custo de modelo ou paridade
completa do navegador. A exploração pode encerrar e preservar estado sem
produzir todas as observações de G01; sua inconclusão é intencional.
