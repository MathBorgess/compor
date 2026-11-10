---
status: recorded
date: 2026-11-10
---

# Validar argumentos no domínio da prova de ação

## Contexto

A preparação do Vault no ADR 0038 separou o domínio das novas provas de ação do domínio estável usado por digests de conteúdo e IDs de idempotência. `createCredentialStudioBindings.issue` assina `argsDigest` com a chave derivada para a prova vinculada. O handler de resultado comparava esse valor com `studioBindings.digest(args)`, que usa o domínio estável. Assim, uma prova válida com argumentos inalterados recebia `403 invalid_binding`, tanto com BYOK nova quanto com a padrão.

A reprodução isolada usou o código de `aa3e10881a8cb663b7551ba2c403a0bb50c8a8d3`, chaves sintéticas e fornecedor simulado. O caminho legado sem envelope respondia 202, enquanto os dois caminhos vinculados respondiam 403 sem enviar o resultado da ferramenta. Nenhum teste comprova qual deployment respondeu ao incidente real.

## Contrato corrigido

`StudioBindings.verify` aceita argumentos opcionais. Quando o campo `args` está presente, valida seu digest com a mesma chave que verifica a prova. O wrapper encaminha essa entrada ao verificador atual ou ao legado BYOK já existente. Campo omitido mantém a verificação preliminar da prova; campo presente e inválido, inclusive `undefined`, não dispensa a comparação.

O handler verifica a prova antes da consulta ao fornecedor e novamente com os argumentos retornados por ele, antes de reclamar recibo ou enviar `tool_result`. As igualdades de tipo, turno, chamada e nome permanecem obrigatórias.

Digests de conteúdo, IDs locais, reservas e digests de resultado continuam no domínio estável. A correção não troca chaves de assinatura, versão dos tokens nem dados persistidos. Provas vinculadas já emitidas podem concluir enquanto válidas com sua credencial original. Provas BYOK anteriores ao envelope continuam usando o domínio histórico. Fonte diferente, chave substituída, envelope retirado ou argumentos alterados continuam recusados.

Esta correção esclarece a aplicação do contrato do ADR 0038; não altera a política de autorização, o fluxo de aprovação de imagens, a recuperação conservadora ou a concorrência do estúdio. Não autoriza reenvio de geração incerta.

## Evidência e limites

Os testes cobrem ACK de ação local, recusa de imagem, efeito local desconhecido, preservação dos IDs e digests estáveis, compatibilidade histórica e rejeição de alterações de argumento, credencial e fonte. A aprovação de imagem continua fora do endpoint genérico de ação.

A validação focada e seus limites estão no [relatório de correção](../quality/studio-action-digest-2026-11-10.md). Não foram feitos merge, deploy, alterações no Vault ou chamadas pagas.

## Adendo de 10/11/2026: digest do recibo da ação

A revisão posterior do PR 48 encontrou uma exceção à frase “Digests de conteúdo, IDs locais, reservas e digests de resultado continuam no domínio estável”. A reivindicação do recibo (`claim_studio_action`) ainda gravava `actionDigest` com o `argsDigest` da prova, no domínio dela. O `resultDigest` já usava o domínio estável.

Uma prova BYOK histórica e uma prova vinculada nova para a mesma chamada produziam digests diferentes para argumentos iguais. A repetição do ACK virava `409 conflict`, em vez de `existing` sem reenvio. A partir desta revisão, o handler grava `studioBindings.digest(args)`, que é estável por fonte e não muda quando a chave é trocada.

Não há migração de dados. Para BYOK, o domínio estável é a chave histórica, então os recibos legados continuam iguais. Na `main` (`aa3e108`), as provas vinculadas eram recusadas antes da reivindicação, então não deveria haver recibo gravado nesse domínio. Nenhum deploy do head anterior do PR foi registrado. Se algum ambiente o executou, uma repetição desses recibos retorna `conflict` e continua sem reenvio.

O teste `the action claim compares stable argument digests…` reproduz o 409 sem a mudança e passa com ela.
