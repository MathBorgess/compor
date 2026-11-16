# ADR 0049 — Lista de posts, preparação e menu lateral

- Data: 15/11/2026.
- Fonte: pedido de chegar à lista vazia após preparar o projeto, colher o contexto de cada novo post antes de compor e reunir as ações num menu lateral recolhível.
- Estado: implementado para avaliação local.

Concluir as referências iniciais leva a **Posts do projeto**. Nenhum post é criado ao abrir ou concluir a preparação. A lista explica o estado vazio e oferece **Criar novo post**. Essa ação cria uma peça local e abre sua preparação: objetivo, mensagem e chamada para ação opcional. Continuar abre a conversa existente, com o compositor vazio; não envia respostas nem inicia geração. O editor manual permanece disponível.

O contexto de cada peça usa os campos já existentes de `posts`. O campo `prepared`, com padrão `true` para estados anteriores, distingue uma preparação interrompida de uma peça já aberta. A nova vista local `prepare-post` permite retomar respostas após reload ou pela lista. Continuar marca a preparação como concluída; informações podem ser alteradas em Configurações deste post. Não se exige CTA nem se impõem novas condições de geração. Pedidos explícitos de novo post feitos pelo agente mantêm a abertura direta do editor e os recibos existentes.

Os turnos sobre referências exigem uma identidade de rascunho no contrato atual. Num projeto sem peça selecionada, a seleção de referências prepara uma origem técnica local identificada por `workflow.referencePieceId`. Ela não aparece como post nem é reutilizada para o primeiro post da pessoa. Não há geração por essa inicialização. A validação exige que a origem exista no estado; snapshots, perguntas pendentes e histórico de referências continuam preservados. Projetos antigos não são reclassificados por heurística.

Esses campos estendem o schema local 3 com valores padrão, sem upgrade do IndexedDB ou migration de banco. Clientes antigos com schemas estritos não reconhecem os campos novos; o downgrade do cliente exige preservar os dados antes de reabrir. Os limites de armazenamento, writer com CAS e arquivos não mudam.

As ações Posts do projeto, Configurações do projeto, Configurações deste post, Revisar post e Salvar versão passam do cabeçalho para um menu à esquerda. Recolhido, mantém ícones com nomes acessíveis e títulos; expandido, mostra os rótulos. O controle informa `aria-expanded`; Escape recolhe e devolve o foco ao controle. No celular, expandir sobrepõe temporariamente o menu sem estreitar o conteúdo; escolher uma ação ou tocar fora recolhe. Marca, título, versão e conta permanecem no cabeçalho. Cores, tipografia e componentes existentes são mantidos.

Substitui a chegada direta ao compositor após preparar o projeto dos ADRs 0044/0045 e a entrada por botão de novo post diretamente no editor descrita nos ADRs 0037/0046. A preparação afeta a ação humana na interface; o contrato das ferramentas e o caminho do agente permanecem. Não altera credenciais, consentimentos, autorização, regras de exploração, versões ou exportação.
