# ADR 0050 — Configurações do projeto em página

- Data: 15/11/2026.
- Fonte: pedido de substituir o modal de configurações por uma página com menu lateral, devido à quantidade de informações.
- Estado: implementado para avaliação local.

Configurações do projeto ocupa o conteúdo principal do estúdio. O menu lateral oferece Contexto, IA, Referências, Marca e direção, Materiais e versões e Histórico anterior; apenas uma seção aparece por vez. O contexto usa os controles existentes em uma lista de expansões no fluxo da página, sem sobrepor os campos ao conteúdo. Cores, tipografia e componentes existentes são mantidos.

A página usa a navegação interna do projeto, sem nova rota HTTP, campo persistido ou migration. O menu indica a seção atual, pode ser recolhido e abre com rótulos no desktop. No celular, permanece compacto e recolhe ao escolher uma seção. Escape recolhe o menu expandido; não fecha a página. O retorno explícito leva à lista ou à criação de origem. Referências mantém seu alcance global ou por post; as configurações específicas do post continuam no diálogo existente.

`StudioShell.workspacePage` apresenta a página e oculta o conteúdo de origem sem desmontá-lo. Assim, conversa não enviada, estado do editor e revisão continuam disponíveis ao retornar. Selecionar uma versão em Materiais e versões mantém a abertura explícita desse post. Sair de Referências continua interrompendo a exploração; abrir configurações ou trocar seções não autoriza geração. Credenciais, consentimentos, snapshots e contratos de ferramentas não mudam.

Nas referências de um post, o mesmo `StudioChat` apresenta seu painel na página por um portal React. O componente que controla o turno permanece montado na origem; não há uma segunda conversa, novo executor ou repetição da análise. Ao voltar, o painel retorna ao estúdio com o rascunho preservado. A conversa de referências globais mantém seu escopo próprio.

Substitui a apresentação das configurações em modal dos ADRs 0044/0046 e complementa o menu lateral do ADR 0049. Não altera a preparação inicial do projeto ou de cada post.
