# Revisão do PR 48: ACK estável, respostas rápidas e seleção visível

## Escopo, base e ambiente

Revisão pedida por Matheus em 10/11/2026 sobre o PR 48, a partir do head `2347547ad02dd987a93241fc68dc56d1d4d1da2d`. A base continua sendo a `main` em `aa3e10881a8cb663b7551ba2c403a0bb50c8a8d3`, conferida no GitHub antes do trabalho. O histórico do CI anterior está no [relatório conjunto](studio-turns-and-sidebar-2026-11-10.md#quality-65).

Ambiente da execução:

- Claude Code no app desktop, modelo Claude Opus 5.5;
- macOS 27.2, Node 24.16.0 e Chrome for Testing 156.0.8078.4, do Playwright;
- harness `mathai-agent-config` `3b095b1`.

Os resultados locais não substituem o CI Linux.

Não houve merge, deploy, alteração no Vault, migration, chamada paga, login real nem uso de credenciais. Os testes usam fornecedores simulados.

## Achados da revisão das provas de ação

1. **Correção do PR confirmada.** `createCredentialStudioBindings.issue` assina `argsDigest` no domínio da prova vinculada. `verify({..., args})` compara os argumentos na mesma chave, atual ou BYOK legada. O handler verifica a prova antes da consulta ao fornecedor e de novo com os argumentos devolvidos por ele. IDs locais e digests de conteúdo continuam no domínio estável.
2. **Achado novo, corrigido.** A reivindicação do recibo gravava `actionDigest` no domínio da prova, enquanto `resultDigest` usava o estável. Uma prova BYOK histórica reivindicada e uma prova vinculada nova para a mesma chamada geravam `409 conflict` em vez de `existing`. O recibo agora usa `studioBindings.digest(args)`. Não há migração: para BYOK, o domínio estável é a chave histórica. O adendo do [ADR 0040](../adr/0040-validacao-argumentos-acoes-estudio.md) detalha a mudança. A regressão falha sem a mudança e passa com ela.
3. **Proteções conferidas, sem alteração:**
   - argumento adulterado, fonte trocada, chave trocada e envelope retirado (`invalid_binding`);
   - prova expirada durante a consulta ao fornecedor;
   - escopo de conta, projeto e pedido assinado;
   - sucesso de imagem recusado no endpoint genérico;
   - resultado local `unknown` sem continuação;
   - consulta de turnos antigos pela prova de recuperação, com fonte divergente sem contato com a OpenAI.

   Nenhuma proteção foi removida para eliminar o 403.
4. **Escopo.** A race condition anterior não foi alterada. As respostas rápidas usam a mesma reserva por `requestId` e o mesmo caminho do compositor, com uma trava síncrona. Não criam outro caminho de envio.

### Simulado versus real

Comprovado com testes simulados:

- o 403 `invalid_binding` reproduzido com chaves sintéticas, BYOK e padrão;
- o ACK único;
- o novo `existing` no lugar de `conflict`.

Não validado em ambiente real: conta nova, chave padrão do Vault, OpenAI e o deployment que respondeu ao incidente. Não afirmamos que todo 403 observado tenha a mesma causa. A rota de ação também responde 403 a `invalid_origin` e `image_confirmation_required`.

## Foco ao mudar de largura

A suíte local encontrou uma falha intermitente no teste da área de referências, anterior a esta revisão. Com o CSS da base, ela apareceu em 3 de 6 rodadas na primeira asserção e em 1 de 12 no passo de foco.

Havia três causas:

- corridas do teste, que conferia visibilidade antes de o React processar o breakpoint e redimensionava antes do foco de abertura;
- duas mudanças de breakpoint no mesmo lote do React, sem rodar o efeito de foco;
- CSS que escondia o controle focado antes do listener.

O teste agora espera esses estados, com as mesmas asserções e os mesmos timeouts. O shell conta as mudanças de breakpoint e lembra o último foco interno.

| Variante, mesmo teste sincronizado | Falhas |
| --- | --- |
| Shell anterior | 27 de 30 |
| Sem o fallback do último foco | 16 de 20 |
| Correção completa | 0 de 30 |

Detalhes no [ADR 0041](../adr/0041-referencias-com-conversa-lateral.md).

## Travamento após falha do PersonaStep

Numa rodada local completa, todas as asserções do `persona-step-browser.test.mjs` passaram, e o teste falhou na limpeza com `ENOTEMPTY` em `.next/dev`. Os hooks `after` rodam na ordem de registro. O `rm` do fixture rodava antes de o `next dev` parar, enquanto o servidor ainda gravava no diretório.

Depois do erro, o servidor e o Chromium continuaram vivos, e o processo do arquivo não terminou. O runner ficou parado por mais de 15 minutos, sem resumo final, até o encerramento manual dos processos órfãos desta rodada.

O sintoma é compatível com a tentativa 1 do Quality 65, que teve falha no PersonaStep, nenhum resumo e o job estourou 20 minutos. O log do CI é incompleto, então isso continua sendo hipótese, não causa comprovada.

O teste agora usa o mesmo padrão dos outros testes com `next dev`: um hook único que fecha o browser, chama `stopApp` (SIGTERM e, após o prazo, SIGKILL) e só então remove o fixture. Uma falha simulada no meio do teste encerrou o processo em 5 s, sem servidor, browser ou diretório restantes. O teste original não teve asserções alteradas.

## Leitura estruturada e respostas rápidas

O turno de seleção continua devolvendo o texto e agora devolve também `reply`, versão 1, com opções de uma lista fechada ([ADR 0042](../adr/0042-leitura-estruturada-e-respostas-rapidas.md)).

Ao clicar, o app registra uma mensagem humana explícita pelo caminho do compositor. O pedido leva `quickReply` e abre no servidor um turno só de texto, sem ferramentas nem reaproveitamento de sessão. “Quero ajustar” só foca o compositor. Mensagens antigas e metadados inválidos voltam ao texto.

## Seleção de referências

“Sua seleção” mostra quantidade, miniatura, origem e remoção. Os cartões repetem origem, estado e remoção. O foco permanece no mesmo cartão ao selecionar e remover. A interface informa que selecionar não aprova a imagem nem todos os seus elementos.

## Verificações

Aprovado localmente no SHA final, salvo o registrado abaixo:

| Check | Resultado |
| --- | --- |
| `npm run quality:lint` | aprovado |
| `npm run quality:typecheck` | aprovado |
| `npm run quality:unit` | agents-api 183/183; agile-deliberation 29/29; attempt-metrics 9/9; images-api 11/11; private-images 64/64; remote-mcp 27/27; compor-mcp 140/140; scripts Python 22/22 |
| `npm run quality:test` | 23/23 |
| `git diff --check` | aprovado |
| `npm run quality:browser` | 387/388, zero skips, em 365 s. A única falha é o teste de caminhos que só falha no macOS, descrito em Limitações |
| `npm run quality:build` | aprovado |
| `npm run quality:performance` | aprovado, sem falhas de orçamento. LCP mediano de 626 ms, TBT 0 e CLS 0,008. JavaScript cliente total de 294.286 bytes gzip, abaixo de 300.000. Antes eram 290.943, então +3.343. Mede a entrada sem sessão, não a geração |
| `npm run check` e `npm run build` em `apps/site` | aprovados |

Regressões novas:

- `packages/agents-api/test/studio-chat.test.mjs`: estrutura, opções inválidas, instruções, turno comum sem estrutura, turno sem ferramentas, recusa antes do provedor, conflito de digest e sessão sem ferramentas não reutilizada.
- `apps/web/test/studio-credential-action.test.mjs`: digest estável do recibo.
- `apps/web/test/studio-quick-replies.test.mjs`: o contrato do cliente aceita exatamente a saída do servidor e recusa variantes fora da lista. Cobre também o registro lateral limitado e validado por entrada, o estado das opções e o texto da mensagem.
- `apps/web/test/studio-quick-replies-browser.test.mjs`: cobre, com o `StudioChat` real:
  - opções e descrições;
  - clique duplo seguido de Enter;
  - rascunho preservado e foco;
  - teclado e “Quero ajustar”;
  - resposta livre;
  - obsolescência;
  - fallback textual e recarga.
- `apps/web/test/reference-selection-browser.test.mjs`: origem, quantidade, remoção pelo cartão e pela bandeja, foco e 390 px sem rolagem horizontal.
- `apps/web/test/studio-reference-composition-browser.test.mjs`: shell, chat, bandeja e galeria reais, sem sobreposição no desktop, alternância no celular, alvos de 44 px e capturas.

Mutações temporárias confirmaram que os testes falham:

- sem a trava de envio;
- sem a restauração de foco ao selecionar;
- com o shell anterior ou sem o fallback do último foco.

## Capturas

As capturas sintéticas ficam em `/tmp/compor-studio-visual-quick-replies-desktop.png`, `-desktop-answered.png`, `-mobile.png` e `/tmp/compor-studio-visual-reference-selection-mobile.png`. O workflow coleta esse prefixo no artefato `studio-screenshots`. Usam imagens desenhadas localmente, não pins nem modelo reais.

## Limitações

- O teste `fontes e diretórios de dependências são privados…`, de `browser-worker-trees.test.mjs`, falha só no macOS. Ali, `/var` é um link para `/private/var`, e o teste compara caminhos sem resolvê-lo. Nem o teste nem `worker-trees.mjs` foram alterados; o CI Linux é a referência.
- Não houve teste com o modelo real. Não sabemos se ele propõe alternativas úteis. A ausência de ferramentas é garantida por construção, não por comportamento observado.
- Não houve teste com pessoas, leitores de tela ou teclados virtuais reais.
- Uma resposta rápida encerra a pausa da pergunta como uma resposta digitada, e a exploração automática continua sob a autorização de 06/11. Matheus confirmou esse comportamento em 10/11, depois desta revisão.

## Procedimento para validar o fluxo real

Executar com uma conta nova, a chave padrão e o deployment que contém o SHA final:

1. Confirmar o SHA publicado no painel da Vercel e que `COMPOR_DEFAULT_OPENAI_ENABLED=true` está configurado. Não registrar valores secretos.
2. Abrir um projeto novo, permitir sugestões e escolher duas referências. Na aba Rede, `POST /api/studio/chat` com `op: "reference_selection"` deve terminar em `completed`, com `reply.version: 1`. O cabeçalho `x-compor-credential-source` deve ser `default`.
3. Clicar em “Concordo”. O pedido seguinte deve levar `quickReply` e nenhuma `previousAttemptKey`, e não deve aparecer pedido de imagem nem de ação.
4. Pedir uma alteração com ferramenta, como “Atualize a oferta para …”. `POST /api/studio/action` deve responder 202. Se responder 403, registrar o corpo: `invalid_binding`, `invalid_origin` e `image_confirmation_required` têm causas diferentes. Registrar também as linhas `COMPOR_STUDIO_EVENT` do log.
5. Repetir os passos 2 e 4 com BYOK e anotar a fonte.
