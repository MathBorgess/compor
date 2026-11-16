# ADR 0057 — Verificação por Goals em três camadas

- Estado: direção e spike local aprovados por Matheus; implementação candidata local, sem ativação do perfil Docker como gate obrigatório.
- Data: 16/11/2026.
- Fonte: respostas Q1–Q10 à entrevista `grill-with-docs` no Codex; Q10 autorizou o spike após fechar o entendimento; [issue 51](https://github.com/MathBorgess/compor/issues/51).

## Decisão

Os Goals desta iniciativa são destinados a agentes externos de desenvolvimento/QA. O ambiente será portátil e operado por comandos com saídas estruturadas, utilizável por agentes dos clientes existentes, como Codex e Cursor. Não se cria um serviço de orquestração de agentes no runtime do Compor.

A cobertura de cada Goal reúne três camadas explicitamente distintas: núcleo offline determinístico para domínio, protocolos e efeitos; navegador para interação, UX e acessibilidade humana; integração real separada para login e fornecedores. A issue 51 começa pelo núcleo offline e registra as lacunas das demais camadas. Um sucesso offline não recebe o significado de experiência completa em produção.

AX significa a experiência do agente ao descobrir ações, observar estado, compreender esperas e erros, retomar e verificar efeitos. UX e A11y humanas continuam explícitas. Usar uma interface programática não demonstra layout, foco ou qualidade visual.

Os 5 segundos de estabilização da seleção e os 15 segundos entre lotes permanecem regras do produto. O trabalho deve tornar motivo, condição de retomada e cancelamento observáveis. Os testes avançam tempo virtual e aguardam estados, sem alterar silenciosamente essas regras para acelerar a execução. Mudar os valores exige uma decisão UX posterior apoiada em medições.

O cenário integrado offline usa PostgreSQL e PostgREST reais locais, preservando PGlite nos testes rápidos existentes. Auth, Storage, Vault e fornecedores têm simulações identificadas; essa escolha não demonstra paridade integral com Supabase. O spike mede o custo antes de propor um gate obrigatório. Um tradutor HTTP falso ligado ao SQL foi preterido para não reimplementar o protocolo que se quer verificar.

O mesmo ambiente oferece regressão determinística e exploração por agente orientada ao Goal. Uma falha descoberta só se torna gate após reprodução determinística. Os critérios do Goal e a revisão dos avaliadores são fixados antes da execução: o agente pode corrigir o app e acrescentar regressões; alterar critérios ou enfraquecer um avaliador requer revisão separada de Matheus. O verificador reexecuta a revisão exata do código e exige evidências além do autorrelato.

A exploração pode operar quando tokens/custo do cliente são desconhecidos, desde que ações, tempo e ciclos de correção tenham limites explícitos. Ao esgotar um limite, preserva evidências e exige nova autorização para continuar. Se o pedido incluir teto financeiro ou de tokens, o modo autônomo só começa num cliente capaz de impor esse teto. O sandbox não apresenta consumo ausente como zero nem promete controlar cobranças externas que não observa.

## Razão e consequências

Uma única prova sem navegador seria mais barata de executar, mas esconderia propriedades que ela não observa. Exigir todos os fornecedores reais a cada iteração aumentaria custo, dependência externa e não determinismo. As três camadas permitem retorno rápido com limites explícitos e evidência complementar vinculada ao mesmo Goal.

A arquitetura compartilha o controlador das operações extraídas com o app e preserva os gates atuais. O [levantamento](../design/2026-11-16-issue-51-goals-descoberta.md) conserva a descoberta; o [desenho de execução](../design/2026-11-16-issue-51-goals-arquitetura.md) descreve o alvo; o [guia executável](../../scripts/verification/README.md) declara o subconjunto implementado. O entendimento final foi aprovado antes do spike. A frequência do novo perfil depende da avaliação das medições e de decisão posterior.

Esta decisão não substitui o runtime gerenciado da Agents API, não amplia autoridade dos agentes do produto e não altera autorizações, RLS, tratamento de incerteza ou publicação. Credenciais e orçamento para futuras integrações reais serão definidos separadamente. Não houve execução paga, instalação, migration remota ou deploy nesta entrevista.
