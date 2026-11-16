# ADR 0052 — IA inicial e jornada única no Estúdio

- Estado: decisão solicitada em 15/11/2026; implementação em validação no PR 50.
- Fonte: pedido de Matheus para usar a IA do Compor por padrão, simplificar a navegação, a seleção de referências e a conversa do post.

Renumerado na integração local para evitar colisão com o ADR 0047 de exclusão de projetos. Este documento veio de `origin/main` como `0047-ia-inicial-e-jornada-unica-no-estudio.md`; sua decisão e fonte histórica foram preservadas.

## Decisão

Um projeto novo registra `workflow.aiPreference='default'`. A escolha explícita de continuar sem IA e as preferências de projetos existentes permanecem como foram salvas. A preferência não contém a chave, não comprova disponibilidade do Vault e não autoriza geração: a IA do Compor ainda exige intenção explícita para o projeto na sessão. BYOK escolhida pela pessoa continua sem fallback para o Vault.

No post, o editor ocupa a área disponível da janela. A conversa pode ser minimizada e reaberta por um único controle acessível; em tela larga ela divide o espaço com a criação, e em tela compacta se sobrepõe ao editor enquanto aberta. O rascunho e a conversa não são recriados pela alternância. Configurações do projeto e Referências ocupam o viewport, com abas acessíveis, conteúdo rolável e saída visível; os diálogos de confirmação, arte e configurações do post mantêm seus tamanhos próprios.

`Sua seleção` é o único lugar para retirar uma referência selecionada do post ou reativar uma compartilhada disponível. Busca e galeria indicam que uma imagem já está selecionada, sem uma segunda remoção. A seleção e a exclusão continuam tendo alcance explícito; reativar uma compartilhada não cria uma cópia local. `Materiais e versões` encaminha aos posts e às versões do post, preservando o acesso aos arquivos da versão escolhida, sem repetir o catálogo e os controles de referências.

As rotas de sinais mantêm o requisito de `piece_id` da migration `20261115000029`. Um erro por coluna ausente não é tratado como seleção vazia, pois isso misturaria sinais gerais e locais. O Preview sem as credenciais de servidor de produção não demonstra o funcionamento da IA nem substitui testes integrados após a migration.

## Compatibilidade e evidência

Esta decisão ajusta o valor inicial do estado local, sem migrar ou reescrever estados anteriores. Substitui a alternância `Conversa` / `Post` / `Ver ambos` do ADR 0044 e o atalho duplicado de referências em `Materiais e versões` descrito no ADR 0046. Mantém os limites de geração, o consentimento externo, a recuperação de turnos incertos, os snapshots, a autorização e o RLS dos ADRs 0038, 0045 e 0046.

Testes sintéticos e de navegador verificam os caminhos locais; a aplicação da migration no banco remoto, o chat autenticado e a publicação dependem de evidência própria do rollout.
