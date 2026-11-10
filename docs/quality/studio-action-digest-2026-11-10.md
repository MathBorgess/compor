# Correção do 403 ao concluir ações do estúdio

Registro da validação isolada, anterior à integração para revisão. A [revalidação conjunta](studio-turns-and-sidebar-2026-11-10.md) reúne este marco com a conversa lateral e atualiza o escopo dos checks.

## Escopo e ambiente

Correção preparada em snapshot isolado do commit `aa3e10881a8cb663b7551ba2c403a0bb50c8a8d3`, em Linux com Node 24.22.1. Não corresponde a deployment nem a um chat Codex Cloud confirmado. A investigação e os testes não leram segredos nem usaram serviços pagos.

Origem: [discussão do PR 44](https://github.com/MathBorgess/compor/pull/44#discussion_r4523963435). O código ainda emitia `argsDigest` no domínio da prova vinculada à credencial, mas comparava o valor com um digest de conteúdo de outro domínio. A assinatura passava; a comparação de argumentos falhava. Isso não depende de a conta ser nova e afeta BYOK nova e padrão.

## Reprodução e correção

Com fornecedor e armazenamento simulados, a implementação original retornou 403 `invalid_binding` e enviou zero ACKs para ação local ou recusa de imagem com ambas as fontes. O caminho BYOK histórico respondeu 202 e enviou um ACK. Seis testes de regressão inicialmente falharam pelo 403 antes da correção.

`verify({..., args})` agora verifica os argumentos na chave da prova selecionada, atual ou BYOK legada. O handler usa esse contrato após ler os argumentos do fornecedor. Digests de conteúdo, IDs de idempotência, envelopes, provas já emitidas e recibos conservam seus formatos. O [ADR 0040](../adr/0040-validacao-argumentos-acoes-estudio.md) detalha o contrato.

## Verificações aprovadas

- 66/66 contratos focados: 13 de integração de credencial/ação, 8 de vínculos de credencial, 2 de prova de ação e 43 de conversa existentes. Nenhum skip.
- 175/175 testes de `packages/agents-api`.
- 29/29 testes de `packages/agile-deliberation`, incluindo integridade das fontes preservadas.
- `npm run quality:lint`.
- `npm --prefix apps/web run typecheck -- --incremental false`.
- `npm run quality:build`: build Next e análise TypeScript concluídos; rotas de chat e ação presentes.
- `npm run quality:test`: 23/23, incluindo fixtures SQL/PGlite, após materializar as migrations originais no snapshot.
- `git diff --check`.

Os testes novos cobrem ACK único, recusa de imagem sem Images API, resultado local desconhecido sem continuação, argumentos alterados, troca de fonte/chave, compatibilidade BYOK histórica, IDs/digests estáveis, argumentos serializados e expiração durante a consulta ao fornecedor. O endpoint genérico continua recusando sucesso de imagem com `image_confirmation_required`. Uma revisão independente não encontrou bloqueador na alteração.

Para repetir os contratos focados na raiz, com dependências locais reinstaladas após mudar o pacote:

```sh
node --test --test-timeout=60000 \
  apps/web/test/openai-credential-bindings.test.mjs \
  apps/web/test/studio-credential-action.test.mjs \
  packages/agents-api/test/studio-chat-bindings.test.mjs \
  packages/agents-api/test/studio-chat.test.mjs
```

## Limites e pendências

- `quality:unit` global não concluiu: testes de outros pacotes dependem de scripts/fixtures e histórico Git de preparação de migrations ausentes no snapshot. As aprovações acima são por escopo, não o gate agregado.
- As duas suítes de navegador selecionadas falharam na inicialização do Chromium com `socket() failed: Operation not permitted`, antes da validação de comportamento. Uma tentativa de lançamento pela aprovação de sandbox teve a mesma falha. Não foram alteradas flags, configurações de segurança ou limites dos testes para ocultar isso. A suíte completa e performance de navegador não foram aprovadas.
- Nenhum teste real de conta nova, Vault de produção ou OpenAI foi executado. É necessário conferir deployment e corpo do 403 observado para atribuir o incidente real a este defeito.
- Não houve alteração da race condition, do layout, de migrations, da política de autonomia, de segredos ou de dados. Não houve publicação, merge nem deploy.

Antes de integrar/publicar: executar o gate completo num checkout com histórico e infraestrutura de navegador compatíveis, revisar o diff e confirmar a publicação separadamente.
