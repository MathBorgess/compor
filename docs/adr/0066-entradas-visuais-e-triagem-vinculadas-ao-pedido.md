# ADR 0066 — Entradas visuais e triagem vinculadas ao pedido

- Data: 17/11/2026.
- Estado: implementação local dos contratos, planejador e rotas; integração completa e ativação não comprovadas. Candidatos externos/gerados permanecem bloqueados nos runtimes sem fonte autoritativa.
- Fonte: aprovação do [desenho de PNGs](../design/2026-11-17-pngs-no-planejamento-e-nos-lotes-paralelos.md) e esclarecimentos de Matheus nesta conversa. “Terra” significa geração de arte. Uploads selecionados são obrigatórios; cópia otimizada é aceita. A decisão posterior acrescentou referências externas/geradas já selecionadas pela pessoa, desde que triadas pelo Agents API antes do GPT Image.

## Contratos e seleção

O manifesto é separado do texto. Contém IDs, ordinais, origem de ingestão declarada, MIME, tamanho, dimensões e hashes do original/transporte; a ordem é semântica. O servidor revalida base64 canônico, bytes, hashes, formato e limites antes de um novo efeito. A verificação de cabeçalhos/estrutura é limitada e não equivale a decodificar todos os pixels. O hash de um original não recebido não comprova a ascendência da cópia; metadados de origem não concedem propriedade nem comprovam gesto humano.

| Formato | Entrada e resultado |
| --- | --- |
| Sem manifesto | Caminho textual legado; mantém seus digests e provas. Não aceita anexos soltos. |
| Manifesto v1 | Somente `local-upload`, todos obrigatórios. Plano estrutural v1, com prova visual de domínio distinto do legado. |
| Manifesto v2 | Uploads obrigatórios e candidatos `external`/`generated`, com `source` explícito e declaração `externalConsent`. Externas sem essa declaração são inválidas; declaração verdadeira continua insuficiente para autorização. |
| Plano v2 | Três itens e `referenceIds` finais: subsequência canônica dos candidatos selecionados, sem duplicatas e contendo todos os uploads. A triagem acontece no mesmo turno do planejamento, sem sessão paga adicional. |

O manifesto v2 conserva `source:null` para upload, `{originUrl,board}` para referência externa Pinterest e `{projectId,imageId}` para gerada. IDs gerados de outro projeto são recusados. O contrato v1 não foi ampliado silenciosamente. Referências com origem desconhecida não ganham uma atribuição local por ausência de `source`; a ingestão e a migração do estado são tratadas na camada de persistência local.

`validateVisualReferenceSelection` valida a seleção; `parseSelectedVisualInput` exige exatamente seus bytes, na ordem assinada. Essa função não verifica autoridade: execução e reposição precisam primeiro validar a prova do plano/ação e o escopo. O agente não pode omitir upload obrigatório, incluir arquivo não escolhido pela pessoa, mudar a ordem nem reutilizar a triagem de outro lote. Um resultado inválido não cria outro turno automaticamente. Na arte individual, a base explicitamente editada continua com papel separado das referências.

## Provas e fronteiras

`visual-input-contract` é puro e utilizável no navegador; `visual-input` depende de criptografia de servidor e valida bytes. Schemas em runtime e declarações TypeScript são atualizados juntos. `visualInputDigest` usa domínio por versão. Os digests do planejador e da intenção também diferenciam ausência, v1 e v2. Uma prova textual antiga não se torna visual adicionando um manifesto, inclusive vazio. O validador estrutural de plano não substitui essa verificação de prova.

Conta autenticada, projeto, conversa, lote, tentativa, fonte/chave e manifesto participam do vínculo; o plano assinado inclui sua seleção final. Contexto e arquivos são copiados antes do primeiro `await` de autorização, evitando alteração posterior ao digest. Nenhuma chave entra no manifesto, nos prompts ou nos metadados operacionais; campos de fonte também recusam padrões de credencial. BYOK e chave padrão preservam suas regras, sem fallback nem reaproveitamento de provas após troca.

Para candidatos v2, a porta de servidor `authorizeVisualInput` precisa confirmar acesso à origem, seleção permitida e consentimento externo aplicável à sessão, além da autorização do projeto. Recebe identidade, escopo e manifesto, sem bytes nem texto criativo. O planejador a consulta antes de reservar e novamente depois da reserva, antes do POST. Intent/resume também a exigem para admitir candidatos. Ausência, erro ou resposta diferente de `true` bloqueiam novos efeitos. Uma perda de autoridade após reserva conserva a pendência; não inventa rejeição do fornecedor.

**Limitação atual:** essa fonte autoritativa e seu adaptador de runtime não estão implementados. `reference-session-consent.ts` conserva somente uma declaração em `sessionStorage`; as rotas de busca/prévia recebem booleanos. `reference_signals`/`generated_image_signals` têm RLS de titular/projeto e vínculo a imagem concluída no segundo caso, mas admitem inserções pelo cliente; não vinculam seleção atual a bytes ou a consentimento da sessão. Não são usados como aprovação suficiente. Os runtimes sem porta mantêm extras fechados, mesmo com `externalConsent:true`; nenhuma flag é ativada nesta mudança. Preparar mocks com autorização não comprova essa integração.

## Recuperação, limites e retenção

Submit do planejamento exige todos os candidatos congelados necessários à triagem. A geração recebe somente o conjunto final assinado. Poll recebe contexto e manifesto, sem blobs; consulta a sessão original por GET e pode reconciliar `store.finish` com a prova exigida. Replays de concluído não finalizam novamente. Falta de autorização atual para um novo efeito não impede essa recuperação de leitura do fornecedor. Perda de bytes, chave, resposta ou prova não autoriza POST repetido.

O limite local é 20 referências, soma de 2 MiB de transporte, 40 milhões de pixels e dimensão máxima de 16.384. Cada arquivo de transporte fica limitado a **786.414 bytes**: base64 mais o prefixo JPEG cabe nos 1.048.576 caracteres de `input_image.image_url` definidos na [referência Create Session](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/create). Original local pode ser maior; precisa de cópia antes de reservar quando exceder o transporte.

O wrapper e handler de `plan` limitam o corpo a 3 MiB; o provider verifica seu corpo serializado. Intent/resume conservam 64 KiB de metadados. Esses limites são inferiores aos 4 MiB documentados para a entrada do [runtime Agents](https://developers.openai.com/api/docs/guides/agents-api/sessions) e aos 4,5 MB de corpo das [Vercel Functions](https://vercel.com/docs/functions/limitations), consultados em 17/11/2026. Não são uma medição de produção ou garantia de aceitação do fornecedor.

A Agents API conserva estado da sessão, atualmente oferece residência de dados somente nos EUA e não suporta ZDR, conforme a [visão geral oficial](https://developers.openai.com/api/docs/guides/agents-api/overview), consultada na mesma data. Não foi confirmado um prazo de retenção para este projeto. Armazenar originais no navegador não impede o envio e a retenção pelo fornecedor. Não acrescentamos upload durável de anexos ao SQL/storage remoto do Compor. Cada chamada de imagem recebe seu próprio conjunto de entradas; não há deduplicação de custo comprovada nem promessa de qualidade ou latência.

## Compatibilidade e evidência

Preserva os recibos, CAS/revogação, proofs efêmeras, três slots, 15 segundos após três conclusões confirmadas, gate de duas rodadas e reposição explícita dos ADRs 0061/0063/0064. Journals guardam plano, manifesto, IDs/digests e blobs locais; não devem guardar `planBinding`, chave ou token de ação. Novos leitores não reinterpretam planos antigos; rollback bloqueia admissões e conserva recuperação e evidência.

Na arte individual, desligar `COMPOR_SELECTED_LOCAL_VISUALS_ENABLED` também recusa novos pedidos com manifesto em `/api/agent/image`, inclusive com prova visual válida emitida antes do desligamento e manifesto vazio. A guarda ocorre antes da aprovação e execução; o caminho legado sem manifesto e a reconciliação de recibos conservam seus contratos. Não cancela operações já admitidas nem transforma resultado desconhecido em recusa confirmada.

Este ADR substitui a restrição textual do primeiro planejador e, para o protocolo v2, a restrição inicial a uploads do desenho de PNGs. A inclusão posterior de extras não elimina a obrigatoriedade dos uploads nem autoriza buscar fontes não selecionadas. Implementação do adaptador autoritativo, interface/persistência completas, verificação do bundle e gates do head integrado continuam etapas separadas.

Testes sintéticos dirigidos cobrem bytes/ordem/subset, omissão de upload, tipos de origem, consentimento declarado insuficiente, limites, troca de conta/escopo/credencial, prova de outro lote, freeze antes de await, falta/perda da porta de autorização, estado desconhecido e poll sem blobs. Nenhuma chamada paga, migration remota, deploy ou validação visual foi executada. As evidências locais ficam em [contratos visuais e planner](../quality/2026-11-17-contratos-visuais-planner.md).
