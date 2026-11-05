# Compor

**Desenvolvimento em 05/11/2026:** consulte a [arquitetura implementada](docs/architecture.md), o [contrato para agentes e contribuições](AGENTS.md), o [índice de ADRs](docs/adr/README.md) e os [gates de qualidade](docs/quality/gates.md). O app web já existe em Next.js/TypeScript; os relatos datados abaixo preservam etapas anteriores e não descrevem integralmente o estado atual.

> **Gestão e documentação compartilhada — 24/10/2026:** a central do projeto passa a ser o [Confluence Compor](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/360627), com [onboarding](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/196637) e [testes e evidências](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/458753). O [Jira SCRUM](https://compor-mathai.atlassian.net/issues?jql=project%20%3D%20SCRUM%20ORDER%20BY%20key) acompanha tarefas, backlog e sprints. As fontes do Drive e os snapshots local e remoto foram preservados como histórico. Compor passa a ser construído em público e em comunidade, com contribuições selecionadas; essa direção não altera a visibilidade nem a licença do repositório. Consulte os [ponteiros e a precedência das fontes](docs/gestao-atlassian.md).

Compor é uma proposta de espaço no navegador para explorar referências e alternativas, convergir em uma direção criativa e produzir um piloto com arte e legenda, preservando autoria, fatos e decisões. O primeiro recorte investiga responsáveis por cursos, mentorias e ebooks com uma tarefa real de comunicação e um obstáculo observável de criação.

**Estado em 23/10/2026:** pesquisa e documentação, sem aplicativo implementado. A reestruturação combina 67 relatos públicos, dez e-mails enviados e debate de sete subagentes em duas rodadas. Há uma devolução e nenhuma resposta humana na checagem de 09:08. O desenho é candidato; necessidade, benefício, pagamento e market fit continuam sem validação direta.

## Site público

A landing está em [`apps/site`](apps/site/README.md): Astro estático, pronto para Cloudflare Workers no domínio `compor.mathai.com.br`. O diretório [`apps/web`](apps/web/README.md) fica reservado para o futuro aplicativo Demo em Next.js na Vercel. Essa página não substitui o protótipo em `prototypes/compor-mcp`.

## Documentos para começar

- [Briefing de design e tese de mercado](docs/briefing-design-e-mercado-2026-10-23.md): leitura de 4–5 minutos para designer e investidor; [Google Docs](https://docs.google.com/document/d/1PqE-ZhGSMkk8J1vV82XC14DMI0ySiayihEVMb2AvH8E).
- [Spec histórica](docs/specs/compor-reestruturado-2026-10-23.md): problema, histórias, experiência, negócio e métricas da proposta de 23/10; requer reconciliação com a direção web atual.
- [Como o debate mudou a proposta](docs/debate/2026-10-23-reestruturacao/README.md): categorias satisfeitas/insatisfeitas, posições, réplicas, premissas contestadas e decisões.
- [Primeira onda de mensagens e e-mails](docs/prospeccao/2026-10-23/mensagens-da-primeira-onda.md): os dez envios, texto e evidências; [controle operacional](docs/prospeccao/2026-10-23/README.md).
- [Dossiê dos relatos](docs/pesquisa/2026-10-23-voz-do-cliente/README.md): 67 registros com fontes, linguagem, satisfações, dores e limites de amostra.
- [Google Docs e verificação](docs/debate/2026-10-23-reestruturacao/google-docs.md): espelhos editáveis na conta pessoal de Matheus.

## Arquitetura v0 e experimento MCP

A pessoa explora imagens e frases, atribui rótulos sugeridos ou próprios e compara alternativas para definir uma direção criativa. Pode rejeitar opções, voltar a divergir e produzir um piloto com arte e legenda. O piloto poderá ser baixado em PNG e o texto copiado; download e aprovação são ações distintas.

O Compor será acessado no navegador, com conexão obrigatória. A direção técnica combina Next.js na Vercel, um agente OpenAI Agents SDK com skills e tools, BYOK da pessoa e Supabase Free como candidato inicial para dados e arquivos privados. O agente pode registrar hipóteses reversíveis sobre preferências, com escopo e evidência, e propor divergências explicadas durante a exploração, preservando preferências confirmadas. A busca vetorial é candidata para recuperar memórias por escopo e bases comuns aprovadas.

Traces e avaliações autorizados usam MLflow privado na Oracle. O reenvio de eventos após falha é futuro, portanto podem existir lacunas. Casos e datasets ajudam a avaliar prompts, tools e trajetórias, sem treinar modelos; promoção do harness exige revisão. Autorização de conteúdo e telemetria é separada do uso da memória para a pessoa. O procedimento de recuperação será manual, com dump do banco e cópia dos arquivos.

A arquitetura v0 foi aprovada por Matheus; o [PR #7](https://github.com/MathBorgess/oficina-em-prancha/pull/7) foi mergeado em 27/10/2026. Aplicação, integração, custos, recuperação e capacidade ainda precisam de implementação e prova. Consulte o [resumo da arquitetura v0](docs/arquitetura-v0.md), o [Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) e o [Jira](https://compor-mathai.atlassian.net/browse/SCRUM-49).

A [SCRUM-51](https://compor-mathai.atlassian.net/browse/SCRUM-51) investiga camadas e Annotate no [protótipo MCP](prototypes/compor-mcp/README.md). As [ondas de avaliação de trajetórias e criativos](docs/evals/2026-10-28-harness/README.md) preservam candidatos, imagens e julgamentos de personas simuladas. Essas adições continuam experimentais e não herdam a aprovação da arquitetura v0.

## Referências de trabalho e histórico

As fontes anteriores à direção web preservam pesquisa e decisões da época; seus contratos técnicos precisam ser reconciliados com a arquitetura v0.

- [Produto e fluxo](docs/produto.md)
- [Persona e posicionamento](docs/persona-e-posicionamento.md)
- [Playbook de descoberta e prospecção](docs/customer-discovery-playbook.md)
- [Negócio e mercado](docs/compor/negocio-e-gtm.md)
- [Arquitetura v0 e diagrama editável](docs/arquitetura-v0.md)
- [Detalhes e contratos históricos de arquitetura](docs/arquitetura.md)
- [Experimento v0](docs/compor/experimento-v0.md)
- [Ordem de construção](docs/compor/plano-construcao.md), [demo e testes](docs/compor/demo-e-testes.md) e [orientações para Mavi](docs/briefing-designer-compor-v1.md)
- [Decisões e origem](docs/decisoes.md)

A spec de 23/10 preserva a proposta anterior e seu contexto de pesquisa. Em conflito com as decisões mais recentes da direção web, prevalece o resumo atual da arquitetura; requisitos não conflitantes continuam candidatos aplicáveis, e a reconciliação integral de produto e métricas ainda está pendente.

## Histórico e método

As [cinco versões locais do dono de 22/10](docs/historico/2026-10-22/LEIA-ME.md) foram preservadas literalmente com hashes antes da revisão. O [debate de 20/10](docs/debate/2026-10-20-rcd/README.md), a [revisão criativa](docs/revisao/2026-10-20-compor/README.md) e a [spec técnica anterior](docs/specs/compor-macos-v1.md) explicam a evolução. Oficina em Prancha era o nome anterior; oficinas e fotografia são recortes históricos.

Método de estratégia: **Revenue-Centric Design, Richard (@richardrx)**, [fonte fixada](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68), [termos próprios](docs/debate/2026-10-20-rcd/RCD-LICENSE.txt). Síntese com `to-spec`. Heurísticas, pesquisas e simulações não equivalem a resultados do Compor.
