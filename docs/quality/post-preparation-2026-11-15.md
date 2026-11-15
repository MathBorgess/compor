# Preparação de posts e menu lateral — verificação local

Mudança descrita no [ADR 0049](../adr/0049-lista-de-posts-preparacao-e-menu-lateral.md). A preparação do projeto chega à lista vazia; criar uma peça abre seu contexto antes da composição. A navegação fica à esquerda, preservando o padrão visual existente.

- ESLint e tipos estritos aprovados.
- Build de produção aprovado em cópia isolada, sem interromper a revisão local. O Next também retornou `issues: []` no diagnóstico de compilação local.
- Domínio, ferramentas e persistência: 47 casos aprovados; quatro casos de IndexedDB inicialmente pulados por falta do caminho do navegador foram executados depois com Chromium. A suíte de armazenamento real teve cinco casos aprovados, sem skips.
- Navegador: lista vazia após a preparação, inclusive com referências globais selecionadas; preparação independente de cada post; CTA opcional; respostas preservadas após reload; compositor vazio; configurações posteriores; teclado e menu recolhível em 1440 e 390 pixels.
- Regressões de nome, conversas isoladas, exploração, edição, versões e resultados incertos foram exercitadas com APIs simuladas. Dez cenários antigos pressupunham um rascunho criado automaticamente: passaram a clicar explicitamente em Criar novo post. Os oito cenários afetados de salvamento/geração/recuperação passaram após essa adaptação; os dois de workspace/identidade também passaram, incluindo exportação integral e troca de conta.
- Inspeção visual em desktop e celular com sessão e projetos simulados, sem alterar os projetos da revisão da pessoa.
- A rodada final de navegação/referências/shell teve 19 casos aprovados, sem falhas ou skips. Após ajustar a posição do menu durante a rolagem, os três cenários de preparação foram repetidos e aprovados, incluindo celular e referências globais antes do primeiro post.

Não houve geração paga, mudança de credenciais/consentimentos, migration de banco ou push. Esta evidência não declara aprovação do Quality gate completo, CI Linux, deploy ou teste entre contas reais. Performance não foi reavaliada, conforme a prioridade indicada pela pessoa.
