# ADR 0048 — Nome explícito e contexto independente

- Data: 15/11/2026.
- Fonte: pedido de corrigir nomes derivados de “Quero divulgar…” e de iniciar o contexto sem copiar a entrada de criação.
- Estado: implementado para avaliação local.

A criação web pede **Nome do projeto**, em campo de uma linha, com exemplo “Mentoria Veloz — Campanha 1”. Envia o nome informado, com espaços externos removidos e limite de 200 caracteres já aceito pela API. Não resume o texto em 48 caracteres e não o classifica como título provisório.

O nome não é uma ideia, oferta ou pedido de post. A pergunta “O que vamos divulgar?” lê somente a resposta em `brief.offer`, inicialmente vazia. Não usa fallback de nome ou `projectIdea`, nem preenche o contexto ao avançar. Respostas já salvas, inclusive uma resposta apagada, continuam sendo retomadas. Nomes e estados antigos não são reescritos por comparação de textos.

A entrada na preparação passa a depender de uma opção explícita `prepare` de `useStudioState`, independente de `projectTitleProvisional`. O estado inicial da preparação é gravado pelo writer com CAS mesmo antes da primeira edição; recarregar imediatamente após criar não pula as perguntas. Não há novo schema de IndexedDB nem migration de banco.

Rascunhos herdados da entrada/login permanecem nos mecanismos de sessão existentes e podem ser consultados em “Rascunho anterior”. Não são inseridos automaticamente no nome ou na resposta do contexto.

Substitui, para novos projetos criados pela interface web, o título derivado da ideia do ADR 0035 e a entrada única de ideia/nome dos ADRs 0044/0045. Estados históricos com título provisório continuam compatíveis. Renomeação manual e renomeação confirmada pelo chat permanecem disponíveis.
