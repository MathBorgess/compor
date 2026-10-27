# Arquitetura v0 — Compor

Resumo da direção em discussão em 27/10/2026. Decisões individuais foram aceitas; a arquitetura como um todo ainda está em revisão. Aplicação, integrações, infraestrutura e testes de produto não foram implementados ou comprovados por esta documentação.

## Diagrama e visão geral

- [Arquitetura, entidades e aprendizado pelo uso](design/compor-arquitetura-v0.excalidraw) — arquivo editável no Excalidraw.
- [Resumo da arquitetura no Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258).
- [Agente e setup — página de aprofundamento](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/4194328/Agente+e+setup+arquitetura+v0) · [diagrama editável](design/compor-agente-setup-v0.excalidraw) · [referências e verificações](design/2026-10-27-agente-setup-referencias.md).
- A pessoa usa o Compor no navegador, com conexão obrigatória, para explorar referências e alternativas, convergir em uma direção criativa e gerar um piloto com arte e legenda. O sistema solicita uma imagem sem texto; textos, preços e datas são editáveis no app, separados da imagem e compostos no PNG. Se a imagem contiver texto inesperado, a pessoa o revisa antes de usar. A saída prevista é baixar o PNG e copiar o texto; o download não constitui aprovação da peça.

## Tecnologias e decisões

- **Aplicação:** Next.js na Vercel, com autenticação inicial pelo Google; a configuração e a elegibilidade do plano para o uso pretendido precisam de verificação.
- **IA:** um agente com OpenAI Agents SDK usa um MCP próprio do Compor na v0 para acessar skills versionadas e tools, sem subagentes. A primeira opção a testar é a comunicação no mesmo processo do backend; sua integração e isolamento ainda precisam de prova. A equipe pode testar o MCP localmente em seus harnesses, em paralelo ao design; acesso remoto por clientes externos e MCP Apps ficam para depois. Cada pessoa usa sua própria chave OpenAI (BYOK), que poderá ser salva de forma protegida ou usada somente na sessão; a chave da equipe serve a testes internos.
- **Dados:** Supabase Free é o candidato inicial para PostgreSQL, autenticação e armazenamento privado de imagens. Uma pessoa trabalha em sua organização na v0. Não há exportação da memória na primeira versão.
- **Contexto:** imagens e frases podem receber rótulos sugeridos ou criados pela pessoa, com significado editável para orientar a análise do agente. A busca vetorial com pgvector é candidata para RAG de memórias por escopo e bases comuns aprovadas; acesso, custo e integração precisam ser testados.
- **Memória:** o agente pode salvar proativamente hipóteses reversíveis com escopo e evidência, preservando preferências confirmadas. A hipótese começa na tarefa ou campanha, sem se propagar automaticamente à marca ou organização. Rejeições recorrentes de tipografia ou partes da composição são evidência de reforço negativo e podem orientar não preferências revisáveis. Para o primeiro experimento, duas rejeições distintas do mesmo aspecto no mesmo escopo são um critério hipotético, ainda não validado; a ampliação de escopo permanece aberta. Evidência posterior contrária pode motivar uma sugestão de revisão, sem substituir preferências confirmadas. Durante uma exploração solicitada, o agente pode propor alternativa que diverge de preferência inferida, explicando o motivo e permitindo rejeição.
- **Observabilidade:** MLflow privado na Oracle, com SQLite e arquivos persistentes como primeira opção, sujeito à capacidade e à proteção do servidor. Trajetórias autorizadas são preservadas para análise; metadados são opcionais, e conteúdo requer autorização específica. Fila e reenvio em falhas ficam para o futuro: a v0 pode ter lacunas nos traces.
- **Aprendizado:** dados do Supabase especificamente autorizados para melhoria podem ser destilados em casos e datasets, complementando traces autorizados do MLflow. A curadoria preserva origem, escopo, data, versão e autorização; não se pressupõem acesso irrestrito ao banco ou anonimização. Evals de prompts, tools e trajetórias apoiam mudanças no harness com revisão humana, sem treinamento de modelos ou promoção automática; a régua de promoção permanece hipótese revisável. Dados de interações anteriores à revogação continuam elegíveis para a finalidade autorizada, inclusive quando recebidos depois; dados posteriores não entram.
- **Recuperação:** procedimento manual protegido para dump do banco e cópia dos arquivos, inclusive os dados do MLflow; BYOK pode precisar ser inserida novamente após restauração. Backups, restauração, custos e disponibilidade ainda requerem verificação.
- **Primeiro piloto:** começar com a equipe e, após verificar autenticação, proteção dos dados e condições dos serviços, convidar pessoas externas. Comparar tarefas reais com o processo habitual de cada participante, avaliando separadamente a diversidade útil das alternativas, o alinhamento da direção à intenção e a obtenção do piloto desejado; incluir não concluintes e registrar resultados desconhecidos como desconhecidos. Avaliar o resultado e os limites respeitados, aceitando diferentes sequências de tools válidas; registrar chamadas para diagnóstico. Oferecer confirmação opcional de que a pessoa obteve o resultado desejado, sem confundir confirmação com download, reação ou aprovação da peça. O benefício ainda precisa ser demonstrado.

O desenvolvimento pode avançar em paralelo: **design** prototipa a experiência; **frontend** implementa a interface e seus estados; **agentic** desenvolve e avalia MCP, skills e tools. Os contratos entre as frentes ainda precisam ser fechados e testados em conjunto. Testes do MCP com harnesses não dependem de uma interface pronta.

## O design precisa possibilitar e incentivar

- Mostrar referências, rótulos e interpretações, distinguindo o que a pessoa informou do que o agente inferiu; permitir corrigir, combinar ou criar rótulos.
- Usar formas e ícones do moodboard como pistas visuais de estilo, sem exigir sua reprodução literal na arte final.
- Preparar um quadro estruturado com referências, pistas e prioridades sem gerar imagem nem salvar memória automaticamente; a pessoa revisa as escolhas antes de gerar.
- Explorar e comparar alternativas, escolher dimensões a variar e manter, rejeitar todas, voltar a divergir e refinar uma direção; os rótulos não implicam que todos os atributos de uma referência devam ser copiados.
- Preservar projeto e alterações em falhas; deixar claro o custo possível de análise e geração com BYOK. A pessoa inicia a exploração e decide quando avançar.
- Permitir editar textos, preços e datas antes de compô-los no PNG, sem exigir aprovação para baixar o rascunho. Se houver fato pendente, avisar e permitir o download; eventual regra para uma saída final permanece em aberto.
- Mostrar como memórias e referências influenciam a tarefa; permitir consultar e corrigir hipóteses, além de consultar, confirmar, corrigir ou remover não preferências quando a pessoa quiser. Oferecer sugestões ocasionais de revisão, sem frequência predefinida.
- Ao rejeitar uma proposta, permitir selecionar o aspecto rejeitado ou explicar o motivo opcionalmente. Sem motivo explícito, uma possível causa apontada pelo agente permanece hipótese, não fato.
- Oferecer reações opcionais por versão e pergunta opcional sobre o motivo de baixar o rascunho; não confundir reação, download e aprovação.
- Distinguir autorização para gerar, armazenar, telemetria e uso de conteúdo para avaliação, incluindo o tratamento de dados anteriores à revogação.

## Histórico e fontes

- [ADR 0007 — Aplicação web com BYOK e dados gerenciados](adr/0007-arquitetura-web-e-byok.md).
- [ADR 0008 — Memória proativa e observabilidade autorizada](adr/0008-memoria-proativa-e-observabilidade.md).
- [ADR 0009 — MCP próprio para as capacidades do Compor](adr/0009-mcp-capacidades-compor.md).

Os [ADRs anteriores](adr/0001-contexto-local-e-colaboracao-github.md), a [arquitetura anterior](arquitetura.md) e a [captura histórica do Confluence](historico/2026-10-27-confluence-arquitetura-v11.html) preservam a evolução e não devem ser tratados integralmente como desenho atual. A [spec anterior](specs/compor-reestruturado-2026-10-23.md) e a [proposta de aprendizado](design/2026-10-26-aprendizado-pelo-uso-proposta.md) precisam de reconciliação; seus requisitos não conflitantes continuam candidatos aplicáveis.
