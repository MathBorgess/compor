# ADR 0056 — Navegação por URL e organização do estúdio

- Estado: implementado no PR 54; revisão e verificação em andamento.
- Data: 16/11/2026.
- Fonte: escopo e commits do [PR 54](https://github.com/MathBorgess/compor/pull/54), aberto por `njrsouza`; Matheus solicitou nesta data revisar as alterações e os comentários antes do merge e da publicação. Este registro descreve o contrato da implementação, sem atribuir aprovação prévia de cada escolha de interface ao dono.

## Contexto

A abertura de projetos e posts dependia somente do estado da interface. A URL não identificava o trabalho aberto, e recarregar ou usar o histórico do navegador não expressava a mesma navegação. A reorganização também aproxima as ações do post da criação e mantém os outros projetos acessíveis sem reintroduzir o seletor da interface legada.

## Contrato

- `/` apresenta a lista de projetos. `/projetos/<projectId>` abre o projeto e `/projetos/<projectId>/posts/<pieceId>` abre um post dele. Os identificadores seguem o formato UUID; o Next reescreve os caminhos de projeto para a página única do estúdio, e `lib/studio-route.ts` interpreta o caminho no cliente.
- A URL acompanha a abertura de projeto/post, links diretos, recarga e voltar/avançar. A seleção continua limitada aos projetos retornados para a conta e aos posts conhecidos daquele projeto. Um projeto indisponível retorna à lista de projetos; um post indisponível retorna à lista de posts do projeto, sem abrir outro post salvo por conveniência.
- Voltar/avançar para outro projeto ou para a página inicial aguarda a preservação local, assim como a navegação pelos controles da interface. Se a gravação falha, o projeto continua montado, o aviso explica a falha e a URL do trabalho aberto é restaurada. O destino fica no histórico para uma tentativa explícita posterior; não se tenta gravar repetidamente após a falha.
- Abrir um projeto pela lista pode retomar sua tela salva e atualizar a URL para o post retomado. Uma preparação ainda incompleta pode ser retomada no caminho do projeto; a navegação não cria um post para satisfazer uma URL. A bancada técnica de referências não é um post endereçável.
- Trocar de conta durante a sessão limpa o caminho aberto. A URL expressa navegação, não identidade nem autorização: handlers autenticados, verificações por operação e RLS continuam obrigatórios.
- A página inicial reúne projetos anteriores, criação e etapas da preparação. Com mais de um projeto, oferece primeiro o último aberto disponível, ou o mais recente quando não há lembrança válida. Somente o ID do último projeto aberto fica em `localStorage`, sob `compor:last-project:<userId>`; a lista autenticada precisa conter esse ID antes de oferecer sua retomada. Falha de storage mantém o fallback da página inicial.
- Um trilho lateral permite alternar entre projetos e destaca o atual. Renomear fica no menu do projeto. Nome, status de versão e ações de referências, configurações, revisão e salvamento ficam junto ao post; a barra superior reúne marca e conta. A mudança de apresentação não altera os contratos de salvamento, aprovação ou exportação.
- Durante a introdução do post, quando a área de criação está oculta, suas configurações permanecem acessíveis pelo menu lateral. Revisar o contexto não exige sair da introdução nem fazer um pedido à IA.
- A conversa apresenta diretamente os controles de contexto, sem o botão externo de mostrar detalhes. Cada seção continua recolhível, e a introdução do post mantém esses metadados ocultos.

Os modais de Configurações do projeto e Referências deste post continuam conforme o [ADR 0055](0055-configuracoes-do-projeto-em-janela-modal.md). Este registro substitui somente a distribuição das ações do post no menu lateral descrita nos ADRs [0049](0049-lista-de-posts-preparacao-e-menu-lateral.md) e [0053](0053-integracao-da-main-e-decisoes-de-usabilidade.md). Preparação, históricos por conversa, seleção de referências, fatos, credenciais, geração explícita e recuperação permanecem nos contratos anteriores.

## Verificação e limites

O teste de navegação reproduziu a falha do link de post inexistente com outro post salvo aberto antes da correção e passou depois. Um teste adicional injeta falha de quota no IndexedDB, verifica a recusa da saída pelo histórico, a URL e os dados mantidos na aba e a preservação após recuperação do armazenamento. Os checks completos de CI ainda estão pendentes neste registro. A suíte usa serviços e dados simulados, sem autorização para chamadas pagas.

Checks locais não comprovam CI Linux, instalação na Vercel, login externo, isolamento entre contas reais ou geração publicada. O merge e o deployment precisam de evidência própria, conforme os [gates de qualidade](../quality/gates.md) e o [ADR 0043](0043-deploy-vercel-por-integracao-git.md).
