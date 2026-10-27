# Compor

> **Gestão e documentação compartilhada — 24/10/2026:** a central do projeto passa a ser o [Confluence Compor](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/360627), com [onboarding](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/196637) e [testes e evidências](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/458753). O [Jira SCRUM](https://compor-mathai.atlassian.net/issues?jql=project%20%3D%20SCRUM%20ORDER%20BY%20key) acompanha tarefas, backlog e sprints. As fontes do Drive e os snapshots local e remoto foram preservados como histórico. Compor passa a ser construído em público e em comunidade, com contribuições selecionadas; essa direção não altera a visibilidade nem a licença do repositório. Consulte os [ponteiros e a precedência das fontes](docs/gestao-atlassian.md).

Compor é a proposta de um espaço para elaborar, comparar e concluir texto e visual de uma divulgação, preservando autoria, fatos e decisões. O primeiro recorte investiga responsáveis por cursos, mentorias e ebooks com uma tarefa real de comunicação e um obstáculo observável de criação.

**Estado em 23/10/2026:** pesquisa e documentação, sem aplicativo implementado. A reestruturação combina 67 relatos públicos, dez e-mails enviados e debate de sete subagentes em duas rodadas. Há uma devolução e nenhuma resposta humana na checagem de 09:08. O desenho é candidato; necessidade, benefício, pagamento e market fit continuam sem validação direta.

## Documentos para começar

- [Briefing de design e tese de mercado](docs/briefing-design-e-mercado-2026-10-23.md): leitura de 4–5 minutos para designer e investidor; [Google Docs](https://docs.google.com/document/d/1PqE-ZhGSMkk8J1vV82XC14DMI0ySiayihEVMb2AvH8E).
- [Spec consolidada](docs/specs/compor-reestruturado-2026-10-23.md): problema, solução, 64 histórias, experiência, negócio, métricas e aceites.
- [Como o debate mudou a proposta](docs/debate/2026-10-23-reestruturacao/README.md): categorias satisfeitas/insatisfeitas, posições, réplicas, premissas contestadas e decisões.
- [Primeira onda de mensagens e e-mails](docs/prospeccao/2026-10-23/mensagens-da-primeira-onda.md): os dez envios, texto e evidências; [controle operacional](docs/prospeccao/2026-10-23/README.md).
- [Dossiê dos relatos](docs/pesquisa/2026-10-23-voz-do-cliente/README.md): 67 registros com fontes, linguagem, satisfações, dores e limites de amostra.
- [Google Docs e verificação](docs/debate/2026-10-23-reestruturacao/google-docs.md): espelhos editáveis na conta pessoal de Matheus.

## Como o produto passa a ser descrito

Quem tem uma mensagem definida começa com uma composição, preservando o texto. Quem quer explorar começa com duas abordagens contrastantes. A pessoa pode comparar, rejeitar, editar, ramificar ou concluir uma peça; explorar outra abordagem permanece visível. Essa configuração será testada, sem transformar quantidade de alternativas em sucesso.

O resultado inicial candidato é uma imagem estática PNG e sua legenda TXT, com projeto local recuperável. A proposta precisa demonstrar benefício sobre Canva, ChatGPT, métodos próprios ou ajuda humana. Revisão desejada é parte da autoria; um processo atual suficiente é motivo legítimo para não trocar. Aquisição e vendas têm causas e evidências próprias.

Ativação significa aprovar e exportar uma arte com legenda, medida sobre todos os qualificados atribuídos. Benefício incremental, uso externo, retorno em nova ocasião e pagamento são resultados separados. A unidade comercial em pesquisa é uma entrega delimitada por campanha; preço, suporte e recorrência ainda precisam de observação.

**Arquitetura v0 em elaboração:** decisões discutidas em 26/10/2026 incluem aplicativo Electron para Windows e macOS, com um usuário e uma organização. O projeto local reúne todas as memórias por escopo, preferências, skills declarativas e recursos; envio ao repositório GitHub da organização é opcional. O setup usa instruções para o agente do usuário, com alternativa manual. OpenAI BYOK e Codex instalado devem atender texto e imagem; o modo Codex depende de G0 e comprovação nativa sem chave BYOK complementar. O compositor local preserva texto, preço e datas editáveis. Backend Oracle reúne compatibilidade, diagnóstico autorizado e observabilidade centralizada em MLflow; sua capacidade precisa ser validada. O conjunto da arquitetura ainda não foi aprovado por completo. Consulte o [desenho e decisões no Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) e os [ADRs](docs/adr/0003-memoria-integral-da-organizacao.md).

Essa arquitetura não comprova implementação, instalação ou integração. Acesso oficial e condições comerciais antecedem venda (G0). O repositório permanece privado. A comparação gratuita/paga continua candidata, sem cobrança ou promessa de beta nesta entrega.

**Perfis para testes do dono — 26/10:** chave OpenAI de teste/da disciplina, BYOK pessoal e proxy Codex local, conforme o [ADR 0004](docs/adr/0004-tres-perfis-de-teste.md). Os dois primeiros usam o mesmo adaptador oficial. O proxy atende Responses no laboratório, com imagem ainda não comprovada, e não substitui a rota Codex de distribuição. O contexto acadêmico orienta configuração; chave, cota e habilitação real precisam estar disponíveis para chamadas de IA.

**Observabilidade — 26/10:** MLflow centralizado na Oracle para traces de operações e avaliações, conforme o [ADR 0005](docs/adr/0005-observabilidade-centralizada-mlflow.md). Metadados opcionais por padrão; conteúdo somente em testes/evals autorizados. A atualização de Q19 preserva traces avaliados, avaliações e contexto autorizado sem expurgo automático, mesmo fora de datasets; cinco dias valem apenas para traces sem avaliação. Datasets selecionados continuam separados, com origem/consentimento. Avaliações em lotes, determinísticas/humanas; modelos avaliadores somente por comando explícito com limite de gasto. O envio não bloqueia o produto. MLflow e a capacidade do servidor ainda não foram implantados ou testados.

**Feedback e harness — 26/10:** sampling automático de casos autorizados, reações rápidas ligadas à versão e corretude/completude opcionais. Tarefa concluída gera sinal positivo; não conclusão observada gera negativo, com motivo e evidência identificados quando disponíveis. Pendências e resultados desconhecidos não geram sinal. O feedback orienta curadoria e comparação de prompts, ferramentas e trajetórias para aprimorar o harness, sem treinamento de modelos ou mudanças automáticas na peça, memória e configuração ativa. Consulte o [ADR 0006](docs/adr/0006-feedback-e-evolucao-do-harness.md).

## Referências de trabalho

- [Produto e fluxo](docs/produto.md)
- [Persona e posicionamento](docs/persona-e-posicionamento.md)
- [Playbook de descoberta e prospecção](docs/customer-discovery-playbook.md)
- [Negócio e mercado](docs/compor/negocio-e-gtm.md)
- [Arquitetura v0 e diagrama editável](docs/arquitetura-v0.md)
- [Detalhes e contratos históricos de arquitetura](docs/arquitetura.md)
- [Experimento v0](docs/compor/experimento-v0.md)
- [Ordem de construção](docs/compor/plano-construcao.md), [demo e testes](docs/compor/demo-e-testes.md) e [orientações para Mavi](docs/briefing-designer-compor-v1.md)
- [Decisões e origem](docs/decisoes.md)

Em conflito sobre público, promessa, fluxo, rotas, ativação ou negócio, prevalece a spec de 23/10 como proposta para o próximo ensaio. Os contratos técnicos não alterados continuam referências candidatas; isso não confirma integração ou implementação.

## Histórico e método

As [cinco versões locais do dono de 22/10](docs/historico/2026-10-22/LEIA-ME.md) foram preservadas literalmente com hashes antes da revisão. O [debate de 20/10](docs/debate/2026-10-20-rcd/README.md), a [revisão criativa](docs/revisao/2026-10-20-compor/README.md) e a [spec técnica anterior](docs/specs/compor-macos-v1.md) explicam a evolução. Oficina em Prancha era o nome anterior; oficinas e fotografia são recortes históricos.

Método de estratégia: **Revenue-Centric Design, Richard (@richardrx)**, [fonte fixada](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68), [termos próprios](docs/debate/2026-10-20-rcd/RCD-LICENSE.txt). Síntese com `to-spec`. Heurísticas, pesquisas e simulações não equivalem a resultados do Compor.
