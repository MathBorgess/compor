# ADR 0046 — Contexto e referências por post

- Estado: decisão de produto aprovada; implementação disponível para avaliação local.
- Data: 15/11/2026.
- Fonte: aprovação explícita do plano de correções após a avaliação local, nesta conversa.

## Decisão

O projeto reúne tema/oferta, marca e público geral. Objetivo, mensagem e chamada para ação pertencem a cada post. A chamada é opcional; um post de autoridade não exige ação comercial. A preparação passa a ter duas perguntas gerais. O primeiro pedido explícito preenche a mensagem do post quando ela estiver vazia, sem inferir objetivo nem exigir outra entrevista. As configurações do post permitem revisar os três campos.

A biblioteca de arquivos continua única no projeto, com os limites existentes. `projectReferenceIds` identifica referências compartilhadas. Cada entrada de `posts`, indexada pelo UUID da peça, contém contexto, referências próprias, exclusões das compartilhadas e critérios locais de direção. A seleção efetiva é a união deduplicada de compartilhadas não excluídas e locais. Adicionar dentro de um post usa alcance local; compartilhar é uma ação explícita. Desmarcar no post não remove a referência do projeto ou de outro post. Um arquivo associado ou usado em snapshots/critério não é apagado.

Materiais e versões encaminha ao mesmo painel, sem outra seleção ou remoção com alcance implícito. O painel de referências ocupa a largura disponível e apresenta busca, envio e propostas em alternativas separadas. Seleção e alcance permanecem identificáveis. A saída retorna ao post preservando rascunho, conversa e imagem. Propostas continuam dependendo de pedido explícito; lotes, intervalo, consentimento externo, interrupção, incerteza e credenciais seguem seus contratos anteriores.

## Persistência e compatibilidade

O schema local é 3 e o IndexedDB é 4. Leitores convertem schemas 1/2 em memória; a primeira gravação usa a mesma transação e CAS para arquivar o original em `stateArchives` e escrever o convertido. `legacyStates` continua preservando o original de schema 1. Falha/ quota aborta a transação inteira. A atualização fecha conexões antigas, e clientes de versão anterior não podem reabrir o banco com versão inferior.

Referências anteriores tornam-se compartilhadas. A ação histórica em `brief.action` permanece preservada e é oferecida para reutilização explícita; não é atribuída automaticamente aos posts nem enviada como sua ação. Conversas, versões, snapshots anteriores, recibos e bytes não são reescritos. Novas peças começam com contexto próprio vazio. As mesmas cotas de referências, arquivos, versões e tamanho total continuam válidas.

## Contexto e operações

`conversationContext` é uma projeção somente para leitura. Redutores, CAS e persistência recebem o estado canônico. Chat, análise, prontidão, fingerprints e transporte de imagens usam a seleção efetiva da conversa. As tentativas novas congelam `postContext`, direção efetiva e referências. Alterações posteriores orientam próximos pedidos, sem reescrever snapshots. O contexto HTTP aceita e valida os três textos de `postContext`; são dados, nunca autoridade.

O executor local recebe a conversa que originou a ação e inclui esse vínculo no fingerprint do recibo. Dentro do post, `compor_editar_briefing` com `offer` altera sua mensagem e com `action` altera sua chamada. Público e direção geral continuam no projeto. Critérios propostos na conversa de post ficam locais. A consulta nativa sem conversa usa a seleção atual para mensagem/ação. As provas assinadas de continuidade e identidade/propriedade por operação permanecem necessárias.

Versões novas preservam `creationContext`; geração confirmada registra o contexto congelado da tentativa e somente as referências pedidas na proposta. Aprovação usa esse snapshot, nunca a seleção atual. Versões históricas sem evidência não ganham atribuição retroativa. Escolha manual de outra imagem remove a atribuição não comprovada; o histórico de tentativas permanece preservado.

## Sinais e aprendizagem

A migration `20261115000029_post_reference_scope.sql` acrescenta `piece_id` opcional aos sinais externos e gerados. `NULL` representa projeto. O UUID identifica um post local e não prova autorização: origem, sessão, propriedade do projeto e RLS continuam obrigatórios. O post pode existir somente neste navegador antes de uma versão ser salva, portanto a associação não exige uma peça remota previamente criada.

Leituras gerais/de conta excluem sinais locais. Leituras por post e contexto combinam sinais gerais e daquele post, recusando respostas de outro alcance. Correções exigem o mesmo alcance na rota e em trigger do banco; conflitos idempotentes também verificam `piece_id`. Seleção/comentário de um post não passa a ser preferência geral. A primeira aprovação atribui somente fontes do snapshot, aceitando sinais do projeto ou daquele post. O histórico da conta admite escolhas locais apenas quando ligadas a uma versão explicitamente aprovada. Reaprovação não credita uma seleção posterior.

Aplicar a migration é pré-requisito de publicação dessas rotas. Nenhuma migration remota, push, PR ou deploy é autorizada por este documento.

## Decisões substituídas e evidência

Substitui do ADR 0044 a pergunta de ação esperada na preparação geral; do ADR 0045, schema 2/IndexedDB 3 e a análise exclusivamente na conversa geral de referências. Substitui do ADR 0037 a seleção única de referências aplicada indistintamente aos posts. Mantém seus requisitos de consentimento, geração explícita, origem, retorno e preservação do trabalho. Os demais requisitos de segurança dos ADRs 0038/0045 permanecem.

Testes e limitações locais serão registrados no relatório de qualidade desta alteração. Resultados com serviços simulados não comprovam CI Linux, migrations remotas, RLS entre contas reais ou qualidade criativa.
