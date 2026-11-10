# ADR 0042 — Leitura estruturada, respostas rápidas e seleção visível

- Estado: recorded; implementação em revisão no PR 48
- Data: 10/11/2026
- Fonte: pedido de Matheus nesta data, na sessão do Claude Code sobre o PR 48: imagens como protagonistas, uma leitura breve depois da seleção e interações estruturadas para escolhas simples, sem limitar a resposta livre.

## Contexto

O turno automático de referências já produzia um objeto com leitura, recomendação e pergunta ([ADR 0029](0029-agente-opinativo-e-pergunta-unica.md)). O servidor validava esse objeto e o convertia em Markdown antes de entregá-lo à interface. Responder exigia digitar. Na tela de referências, a seleção só aparecia no estado do cartão escolhido. A remoção ficava na gaveta de bases, e a origem de cada imagem não era explícita.

## Decisão

### Contrato da leitura

O servidor continua devolvendo `text`, o fallback textual de sempre. No turno de seleção, devolve também `reply`, versão 1, com `reading`, `recommendation`, `question`, `synthesis` opcional e `options`.

As opções vêm de uma lista fechada. O aplicativo define “Concordo” (`agree`) e “Quero ajustar” (`adjust`). O modelo pode propor, num objeto opcional `opcoes`, uma síntese de até 80 caracteres e no máximo duas alternativas de gosto (`prefer`). Cada alternativa tem rótulo de até 40 caracteres e descrição de até 140, como “Agressivo” e o que essa escolha muda no visual.

Textos de opção são texto simples. Não aceitam pergunta, link, marcação Markdown ou HTML, caractere de controle nem formato de chave. Uma opção inválida descarta o objeto opcional inteiro sem invalidar a leitura. A frase “exatamente três campos de texto” das instruções continua verdadeira: `opcoes` é um objeto.

O cliente valida `reply` de novo com um schema estrito. Não executa HTML, código ou ferramentas vindos do modelo e não infere botões a partir do texto. Turnos comuns nunca recebem estrutura.

### Persistência e vínculo

A estrutura fica num registro lateral do `localStorage`, `compor-quick-replies:v1:<conta>:<projeto>`, com no máximo 12 entradas. Cada entrada é validada isoladamente e se vincula a:

- `messageId` da mensagem do assistente;
- `requestId` do turno;
- impressão digital das referências;
- digest do contexto;
- época da rodada.

Essas são as mesmas chaves que decidem quando nasce uma nova leitura. O estado do estúdio não muda de schema: uma aba aberta com a versão anterior continua lendo o estado. Uma entrada ausente, inválida ou corrompida mostra apenas o texto.

### Clique e envio

“Concordo” e uma alternativa compõem uma mensagem humana que nomeia o que foi escolhido. Exemplos: “Concordo com a recomendação: <síntese>.” e “Prefiro esta alternativa: <rótulo> — <descrição>.”. A mensagem usa o mesmo caminho do compositor (`submitText`).

Uma trava síncrona compartilhada impede clique duplo e clique seguido de Enter. O rascunho digitado permanece intacto. O foco vai para a confirmação da escolha.

“Quero ajustar” só foca o compositor e não envia nada. O prefixo “Quero ajustar a recomendação: ” só entra se o compositor estiver vazio.

### Turno da resposta rápida

O pedido leva `quickReply: {version: 1, intent: "agree" | "prefer"}`. O servidor abre um turno só de texto, sem ferramentas, e nunca reaproveita uma sessão. Combinações inválidas, com `previousAttemptKey` ou com o evento automático, recebem 400 antes de reserva ou fornecedor.

O campo entra no digest da reserva. As instruções dizem que a resposta registra gosto e direção, e não pedido de imagem, aprovação ou aceite comercial. Uma sessão sem ferramentas não é reutilizada pela mensagem seguinte.

### Estado das opções

Qualquer mensagem humana posterior responde à pergunta. É o mesmo critério da pausa da exploração (`pendingSelectionQuestion`). As opções ficam desativadas com “Você escolheu …” ou “Você respondeu na conversa.”. Uma leitura mais recente, ou uma mudança de seleção, contexto ou época da rodada, torna as opções obsoletas.

As opções também ficam indisponíveis sem IA, com turno pendente, inspeção em curso ou fonte de credencial divergente.

### Exploração

Uma resposta rápida equivale a responder por texto. Ela encerra a pausa da pergunta como já faz qualquer resposta. A exploração continua sob a autorização de 06/11: lotes de três, espera de 15 segundos e parada após duas rodadas sem retorno.

O turno da resposta não tem ferramentas, então não chama `generate_image`, salvamento, aprovação nem renomeação. Se Matheus preferir que uma resposta rápida não retome a exploração automática, essa é uma decisão pendente dele.

### Tela de referências

“Sua seleção” fica acima das sugestões, sem cobrir as imagens. Mostra a quantidade (“N de 20 referências”), a miniatura, a origem e a ação de remover de cada imagem. As origens são “Pinterest · externa”, “Gerada pelo Compor” e “Enviada por você”.

Os cartões do Pinterest e as imagens geradas exibem a origem, “✓ Selecionada” e “Remover da seleção”. Ao selecionar, o foco passa para a remoção do mesmo cartão. Ao remover, volta ao botão de seleção, ao próximo item da bandeja ou ao título da bandeja.

A bandeja informa que selecionar orienta o gosto e não aprova a imagem nem todos os seus elementos. A remoção usa a rotina existente: uma referência usada como exemplo na Direção continua preservada, e nenhum sinal novo de desseleção é enviado ao servidor.

## Relações

Complementa o ADR 0029, cuja forma da leitura permanece, e o [ADR 0041](0041-referencias-com-conversa-lateral.md), cujo layout permanece. Não substitui decisões anteriores sobre consentimento por sessão ([ADR 0037](0037-referencias-sugeridas-e-retorno-ao-post.md)), geração guiada, recuperação conservadora ou concorrência do estúdio. A race condition anterior continua fora do escopo.

## Evidência e limites

Testes simulados cobrem o contrato do servidor e do cliente, opções inválidas, turno sem ferramentas e recusa antes do provedor. Testes de navegador com o `StudioChat` real e fornecedor simulado cobrem:

- clique duplo seguido de Enter;
- teclado;
- preservação do rascunho;
- foco;
- resposta livre;
- obsolescência;
- fallback textual;
- recarga.

Testes de navegador também cobrem a bandeja, as origens, a remoção, o foco e a largura de 390 px. Duas mutações temporárias confirmaram que o teste de clique duplo depende da trava e que o teste de foco depende da restauração.

Nenhum teste usou o modelo real. Não há evidência de que ele proponha alternativas úteis ou respeite a ausência de ferramentas na prática, além do bloqueio por construção. Não houve teste com pessoas, leitores de tela ou teclados virtuais reais.
