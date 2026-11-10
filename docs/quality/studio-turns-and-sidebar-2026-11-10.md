# Revisão conjunta: ações do estúdio e conversa lateral

## Escopo e base

Integração dos dois marcos solicitados por Matheus para revisão, sem merge ou deploy. A `main` foi conferida no GitHub em `aa3e10881a8cb663b7551ba2c403a0bb50c8a8d3`. Os 477 arquivos do snapshot inicial e as 35 fixtures adicionais usadas nos testes coincidem com os blobs desse commit. A publicação da branch preserva a árvore remota completa, incluindo arquivos ausentes do snapshot local.

- [ADR 0040](../adr/0040-validacao-argumentos-acoes-estudio.md): validação de argumentos no domínio da prova, corrigindo o `403 invalid_binding` reproduzido com fornecedores simulados e preservando idempotência e compatibilidade BYOK histórica.
- [ADR 0041](../adr/0041-referencias-com-conversa-lateral.md): referências como conteúdo principal, conversa lateral no desktop e alternância em fluxo até 1000 px; o editor conserva a conversa flutuante.

O índice de ADRs e as duas seções afetadas do mapa de arquitetura foram conciliados. A correção não muda autorização de geração, segredos, migrations, recuperação conservadora ou política de autonomia.

## Revalidação do código combinado

Linux, Node 24.22.1, com dependências fixadas nos lockfiles. As cópias locais do pacote `agents-api` foram atualizadas antes dos testes e do build.

Aprovados:

- `npm run quality:lint` e ESLint dos oito arquivos de testes alterados.
- `npm --prefix apps/web run typecheck -- --incremental false`.
- `npm run quality:build`.
- 66/66 contratos focados de credencial, ação e conversa, sem skips.
- 175/175 testes de `packages/agents-api` e 29/29 de `packages/agile-deliberation`, sem skips. Os 66 contratos focados se sobrepõem a essas suítes; as contagens não devem ser somadas.
- 63/63 contratos de seleção, consentimento, exploração, referência gerada, estado, persistência de estado, contexto e turno de referências, sem skips.
- `npm run quality:test`: 23/23.
- `git diff --check`.

O build contém 16 chunks JavaScript, somando 290.818 bytes gzip com `gzipSync` padrão do Node, abaixo do orçamento de 300.000 bytes. Essa contagem estática não aprova Lighthouse nem o gate completo de performance.

## Bloqueios e validação pendente

- `quality:unit` agregado foi tentado, mas não passou: faltam no snapshot scripts/fixtures de outros pacotes, como `supabase/tests/rls_two_identities_capture.sh`, e o histórico completo necessário aos testes de preparação de migrations. Os resultados focados acima não substituem o gate agregado no checkout completo do CI.
- Os contratos de navegador não foram reexecutados nesta integração. As tentativas dos dois marcos já falharam ao iniciar o Chromium por `socket() failed: Operation not permitted`, antes das interações. Não há aprovação local da geometria, screenshots, teclado virtual ou leitores de tela.
- `quality:browser` completo e `quality:performance` permanecem pendentes em ambiente compatível. A suíte nova inclui desktop, 1024 px, 768 px, 390 px, 320 px, viewport visual reduzido, contexto expandido, alternâncias e retorno ao editor.
- Não houve teste real com conta nova, login Google, chave padrão no Vault ou OpenAI. O defeito de digest foi reproduzido e corrigido em testes simulados; isso não comprova sozinho a causa de todo 403 observado em produção nem qualidade criativa.

Antes de aprovar o código, conferir os checks do SHA exato do PR e revisar a interface em navegador funcional. Merge, deploy, configuração remota e chamadas pagas não fazem parte desta revisão.

Os [resultados isolados da correção de ações](studio-action-digest-2026-11-10.md) e os limites da UI no ADR 0041 descrevem etapas anteriores à integração, não uma validação do produto em produção.
