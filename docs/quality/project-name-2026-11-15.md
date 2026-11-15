# Nome e contexto de projetos — verificação local

Conforme [ADR 0048](../adr/0048-nome-explicito-e-contexto-independente.md), a criação agora recebe um nome explícito de até 200 caracteres e inicia o contexto em branco. Estado anterior, nomes e rascunhos herdados não são apagados. A preparação é independente do título provisório e enfileira sua gravação inicial sem esperar a primeira resposta.

- Chromium: 13 casos de criação, teclado, renomeação, posts e retomada aprovados; expectativas atualizadas para o nome escolhido e contexto fornecido explicitamente.
- Chromium: quatro casos finais aprovados, cobrindo nome acima de 48 caracteres preservado integralmente, contexto vazio, reload antes de responder, edição/limpeza, rascunhos antigos e troca de conta com resposta atrasada. Sem erros de página nas fixtures. A troca de conta é observada pelo seu rótulo e pelo rascunho preservado, sem depender de preencher o campo de nome.
- ESLint e tipos estritos aprovados. Build de produção aprovado em cópia isolada; o detalhe final de consulta do rascunho anterior também foi compilado e exercitado no navegador.

Testes com serviços simulados, sem geração paga, limpeza dos projetos locais, migration ou push. Não se declara execução de CI Linux ou aprovação de todos os gates por inferência. A estrutura visual existente foi mantida.
