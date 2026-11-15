# ADR 0045 — Conversas isoladas por post

- Estado: decisão de produto aprovada; implementação local em verificação.
- Data: 15/11/2026.
- Fonte: aprovação explícita de conversa e versões próprias de cada post, compartilhando o contexto geral do projeto, nesta conversa.

## Decisão e representação

O estado criativo local passa ao schema 2. Mensagens e snapshots de tentativas novas registram `conversationId`: o UUID da peça para conversa de post, ou `references` para análise de referências do projeto. A coleção persistida continua única por conta/projeto, permitindo manter revisão esperada, limites e alterações atômicas; associação explícita, histórico enviado ao modelo e continuidade de provedor são separados por conversa. Não se trata somente de filtrar bolhas na tela.

O estado de preparação contém fase, pergunta atual, início da edição do contexto, vista, preferência de IA e última versão selecionada de cada peça. Nenhuma credencial faz parte dele. Compositores usam armazenamento da sessão da aba, com validação, por conta/projeto/conversa. Sua escrita é independente da revisão criativa: digitar não invalida o snapshot de uma ferramenta. Quota/falha de leitura ou gravação é apresentada sem prometer persistência.

Marcadores de continuidade, pendência, leitura de referências e respostas rápidas usam o escopo da conversa. A trava de envio de imagem permanece distinta, com a proteção do projeto existente, para não permitir geração concorrente nem reenvio incerto. Conversas visitadas podem permanecer montadas e ocultas ao trocar de post; cada campo e controle tem identificador DOM próprio. Uma operação continua vinculada à sua origem, e aplicação de imagem confere peça/versão. Pedir novo post pelo agente preserva o turno na conversa de origem; não copia seu histórico para a conversa nova.

## Servidor e compatibilidade

Novas chamadas de chat e ação enviam `conversationId`, validado em runtime. Quando for peça, o identificador deve corresponder ao contexto do pedido. Ele não concede propriedade: continuam as verificações de identidade, projeto e versão na operação correspondente.

A prova HMAC de recuperação assina o escopo da conversa. O chat confere esse escopo antes de consultar ou reutilizar uma sessão gerenciada, inclusive na consulta de uma tentativa já existente. O digest da reserva inclui o escopo nas chamadas novas. Prova de outra conversa não é promovida a uma continuação válida.

O campo é opcional para preservar os protocolos históricos: cliente legado sem escopo continua podendo consultar sua prova histórica sob identidade/projeto/fonte verificados. Uma conversa nova com escopo não adota prova sem escopo. O envelope vinculado à credencial continua sendo obrigatório nas provas novas; os domínios e as exceções históricas dos ADRs 0038/0040 não foram removidos. O vínculo continua armazenado na coluna existente; não é criada sincronização remota de conversas nem uma tabela nova.

## Migração local

O leitor aceita schema 1 e converte em memória para schema 2, com preparação concluída, sem iniciar IA. Mensagens, tentativas, recibos e imagens são preservados. Históricos com contexto inequívoco podem ser apresentados no post correspondente; leitura automática de referências é reconhecida por seus snapshots e origem. Conteúdo sem vínculo inequívoco permanece consultável em Histórico anterior, sem alimentar automaticamente os posts.

IndexedDB passa da versão 2 para 3 e acrescenta `legacyStates`. No primeiro salvamento de um registro schema 1, original e estado convertido são gravados na mesma transação. Falha aborta ambos. A versão de banco força o encerramento de conexões anteriores pelo mecanismo existente; abrir uma conexão com versão inferior falha. CAS e revisão esperada continuam impedindo escrita de um estado vazio sobre conteúdo existente.

Marcadores de tentativas históricas não são apagados nem reenviados. Histórico anterior permite consulta/recuperação pelo protocolo original, com compositor e novas iniciativas desabilitados. Não inventar uma conversa de destino para recuperar uma operação ambígua.

## Verificação

Testes de domínio cobrem separação, versões selecionadas, migração idempotente e recusa de campos inválidos. Contratos de servidor cobrem prova assinada, adulteração, consulta/reutilização entre posts e compatibilidade de prova histórica. Navegador deve cobrir dois posts, rascunhos, reload, referências, operação atrasada, troca de fonte e gravação local. Registrar resultados finais e limitações separadamente; teste simulado não comprova isolamento em Supabase real ou CI Linux.
