# ADR 0062 — Reconciliação explícita da exploração interrompida

**Estado:** implementação local em validação, 17/11/2026.

## Contexto

Uma resposta de imagem pode chegar depois de pausa, saída da tela, troca de projeto, fonte ou sessão. Cancelar o HTTP não prova que o fornecedor parou, e a resposta antiga pode vencer o cancelamento. A implementação anterior permitia reconciliar e apagar o marcador ao receber o POST depois da saída da tela; ela também podia avançar após uma mudança de fonte.

## Decisão

Quando o ciclo que enviou a exploração deixa de estar ativo ou seu escopo/credencial muda, a resposta tardia não modifica o progresso nem remove o marcador. A requisição externa já enviada pode terminar; isso não é apresentado como cancelamento. Ao retornar ao projeto e à conversa de origem, o cliente consulta o mesmo ID no servidor. Se o marcador pertence a outro projeto ou conversa, orienta a abrir a origem e não o consulta nem remove naquele escopo. Quando o GET confirma a conclusão, preserva a origem e registra o resultado, remove o marcador e para: um novo envio depende de novo gesto da pessoa. Resultado desconhecido permanece bloqueante. Se essa confirmação fechar o lote, os 15 segundos começam na retomada visível; o tempo fora da tela ou aguardando persistir o resultado não conta.

Uma resposta correlacionada `not_started`, com HTTP 400/403/404/413/503 e `retryAutomatically:false`, confirma que a rota não reservou a geração; portanto, não haverá registro correspondente na listagem do servidor. Se chegar após interrupção, o cliente acrescenta ao próprio marcador esse recibo mínimo, o ID da conta e a fonte original (`byok`/`default`), sem chave, somente se o marcador ainda for exatamente o despachado. Não remove a pendência, não avança o lote e não inicia outra imagem naquele momento. A recarga preserva o recibo. Um gesto explícito no projeto e conversa originais confere a conta/correlação, remove a pendência e para; outro envio exige outro gesto. A fonte original é evidência do despacho, não credencial para uma chamada nova.

Esse registro local preserva a resposta recebida; não cria prova de autoridade para o servidor. Resposta divergente, status incerto, erro de transporte, falha ao persistir ou marcador substituído não são convertidos em não envio. Se a resposta não chegou e não há recibo persistido, a ausência na listagem continua insuficiente para liberar a tentativa.

Essa regra substitui somente a reconciliação automática do POST recebido após saída no fluxo sequencial anterior; não altera a quantidade de imagens, os gates de interação, as provas nem os recibos do fornecedor. Uma resposta tardia da RPC de retomada também não desfaz uma pausa ou troca de escopo que ocorreu enquanto ela estava em voo.

Marcadores legados sem conversa de origem não são atribuídos ao post aberto nem removidos por uma consulta de outro escopo. Eles permanecem bloqueados e exigem recuperação assistida com evidência da origem; a ausência desse campo não prova que pertencem às referências gerais.

## Evidência e limites

Os testes simulam cancelamento ineficaz, respostas tardias, troca de projeto/fonte, retorno com GET e não envio confirmado após saída/recarga, além de respostas sem correlação e marcador substituído; nenhum chama provedor pago. O banco continua sendo a autoridade dos recibos de operações reservadas. O navegador não garante cancelar um efeito já iniciado, e perder a resposta não autoriza repetição automática. Validação local não prova o comportamento de produção ou de outros dispositivos.
