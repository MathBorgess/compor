# ADR 0054 — Bancada de referências e passagem para a v0

- Estado: decisão solicitada por Matheus; implementada e validada localmente. Publicação e migrations remotas são evidências separadas.
- Data: 15/11/2026.
- Fonte: escolha explícita do exemplo visual 3 e dos detalhamentos de Pinterest/propostas, seguida do pedido de implementação com a última proposta do Compor preservada como v0 e de integração com o PR 52.

## Decisão

Referências passa a ser uma bancada: exploração de imagens na região superior, seleção compacta no meio e conversa na região inferior. A busca do Pinterest, o envio e as propostas usam a mesma região de exploração. Galeria e histórico têm rolagens próprias; o compositor e a saída continuam acessíveis. Em janelas menores, as regiões se ajustam sem substituir a conversa por um aviso para voltar ao post.

`Buscar referências` abre a busca. O primeiro acesso externo exige permissão para a sessão da conta; só as referências escolhidas entram no contexto. `Pedir 3 propostas` é um pedido explícito de geração. `Ver propostas anteriores` apenas consulta o trabalho existente. Abrir a bancada ou consultar imagens não autoriza geração. Lotes, intervalos, interrupção por pergunta, limites de rodadas, credenciais e recuperação de incerteza mantêm os contratos anteriores.

A leitura atual pode ficar ao lado do histórico dentro do painel de conversa. Leituras respondidas ou substituídas ficam recolhidas e podem ser reabertas, com seus textos e decisões preservados. Seleção, remoção e compartilhamento mantêm o alcance do projeto ou post. Retirada continua concentrada em `Sua seleção`. A pessoa pode seguir sem referências.

Ao continuar para um rascunho novo e vazio, a última exploração **concluída e vinculada à conversa correspondente** pode fornecer os bytes da imagem-base da v0. A transição não gera outra imagem, não cria aprovação nem transforma a exploração em versão remota salva. Referências do Pinterest e uploads não substituem essa candidata apenas por terem sido escolhidos depois. Um rascunho com imagem, edição, aprovação ou versão salva é preservado.

Na preparação inicial, sair das referências abre a lista de posts vazia e guarda um encaminhamento local da conversa de origem. A identidade técnica usada pela conversa de referências não é um post do catálogo nem recebe a imagem-base. A pessoa escolhe **Criar novo post**, informa o nome e confirma; somente após o recibo de `/api/posts` corresponder à preparação atual a candidata pode ser aplicada ao novo rascunho. O encaminhamento é consumido após a passagem bem-sucedida. Uma confirmação atrasada de outra preparação não aplica a imagem ao post seguinte. Um pedido de novo post feito pelo agente abre o mesmo formulário e retorna `declined` até a confirmação humana, sem alegar que criou uma peça.

## Estado, origem e recuperação

Metadados opcionais de conclusão são mantidos no estado local, por conversa, com identificador e ordinal da imagem. O marcador da operação em andamento pode preservar o alcance e o contexto do despacho. A v0 conserva a origem da exploração; referências ou contexto alterados depois da geração não recebem atribuição retroativa sobre seus pixels. Sem evidência de contexto original, a origem permanece limitada ao que é conhecido.

Os bytes passam por leitura autenticada e validação antes da cópia local. A inserção no IndexedDB é condicional: uma imagem-base colocada por outra aba não é sobrescrita. Falha de consulta ou armazenamento não deve iniciar geração nem descartar referências. Gerações legadas sem vínculo de conversa não ganham atribuição a outro post por inferência. A compatibilidade dos campos opcionais é validada pelo leitor atual; leitores históricos estritos não passam a aceitá-los automaticamente.

## Decisões substituídas

Substitui a disposição de referências e conversa empilhadas dos ADRs 0044/0052 e a orientação de sair das referências de um post para conversar. Mantém a separação de conversas do ADR 0045, o alcance e os snapshots do ADR 0046, a remoção centralizada do ADR 0052, a confirmação e o catálogo do ADR 0051 e os demais contratos de autorização, persistência e geração. O portal do chat preserva um único controlador, turno e texto ainda não enviado ao abrir as referências do post.

## Evidência

O relatório de qualidade desta alteração deve registrar checks, testes do percurso completo, inspeção visual e limites separadamente. Serviços simulados não comprovam geração real, produção, isolamento entre contas reais ou qualidade criativa.
