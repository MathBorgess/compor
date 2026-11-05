# Portabilidade dos gates em Linux

O [workflow de `b3582bb`](https://github.com/MathBorgess/compor/actions/runs/42130945357) confirmou a correção dos pins de migração, mas revelou dependências do ambiente local no protótipo e uma falha de interação no teste web. Os gates continuaram bloqueando a publicação; a versão preparada na Vercel não recebeu o domínio principal.

## Dependências e calibração

O job de contratos agora instala `webp` e verifica `cwebp` e `dwebp` antes dos testes. O teste que fixava `/opt/homebrew/bin/cwebp` usa o `PATH`. Ocultar os codecs reproduziu as duas falhas de imagem; com os codecs presentes, os dois testes passaram mantendo as verificações de pixels, transparência e metadados.

A calibração regenerava floats com funções matemáticas que não garantem os mesmos bytes entre implementações. No Linux, os hashes dos datasets diferiram, embora os 97 ensaios, a seleção e as métricas coincidissem. O replay passa a consumir os mesmos bytes históricos, com tamanho e SHA-256 verificados antes do parse. O gerador padrão continua disponível; seus inputs são comparados às fixtures com dados discretos exatos e tolerância numérica documentada. Os [relatórios e a proveniência do replay](../evals/2026-10-29-phoenix-calibracao/README.md#replay-dos-dados-históricos--05112026) preservam a distinção entre dados históricos e código executado.

## Interação de upload no teste web

`studio-chat-flow-browser.test.mjs` falhou ao esperar a primeira imagem do teste de troca durante codificação. Onze execuções isoladas passaram. Com CPU limitada a 4×, o envio direto por `setInputFiles` reproduziu o timeout de 6 segundos sem disparar eventos de mudança, decodificação ou escrita no IndexedDB.

O helper agora clica no input e preenche o seletor de arquivos real, usando as verificações de interação do Playwright. Essa abordagem passou 3/3 na mesma condição e 9/9 no arquivo completo. O timeout e as assertions foram preservados. O diagnóstico de falha contém somente MIME, tamanho, alertas e seleção da fixture. A evidência aponta sincronização da interação do teste; não comprova um defeito de upload na aplicação.

## Verificações locais

- Job de contratos completo: 393 testes Node e nove Python, sem falhas ou skips.
- Após acrescentar a guarda numérica final, calibração dirigida: 3/3.
- Arquivo web completo após corrigir o seletor: 9/9.
- ESLint, validação do YAML/shell e `git diff --check` aprovados.

Uma nova execução Linux ainda é necessária para validar estas correções juntas. Não houve alteração de orçamento de performance, remoção de check, migração remota ou chamada paga. As fixtures comprimidas pertencem exclusivamente aos testes do protótipo e não entram no bundle de publicação web.
