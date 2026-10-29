---
status: accepted
---

# Motor de recomendação visual Phoenix e adaptação MCP Dual

## Ajuste de 29/10/2026 — prototipação conversacional no Codex

Matheus decidiu que a prototipação local do Compor será conduzida no chat, sem interface HTML. A busca curada e a seleção de atributos são apresentadas na conversa; perfil e mudanças são acompanhados proativamente pelo Codex. O texto abaixo que pede aviso na web descreve a proposta anterior, substituída para este protótipo pela notificação conversacional. O cliente Codex pode gerar a peça com sua ferramenta de imagens; o servidor MCP prepara direção e referências e não é, por si só, um gerador de imagens. Supabase não é requisito para o fluxo local. Luna ou a API de decisão podem ser utilizados conforme disponibilidade e autorização, com indicação do motor efetivo.

## Atualização de 29/10/2026 — decisão e evidência

O texto original abaixo preserva a proposta inicial. A aprovação da direção não comprova que a arquitetura, suas integrações ou sua infraestrutura foram implantadas. Em `834acced`, a revisão descrita em [SCRUM-57](https://compor-mathai.atlassian.net/browse/SCRUM-57) encontrou candidatos sintéticos e perfil em memória do processo; 49 testes determinísticos não demonstram qualidade criativa, isolamento, cache efetivo ou custo. O diagrama Phoenix no [Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) é proposta. Resultados posteriores exigem evidência própria.

As decisões de [SCRUM-58](https://compor-mathai.atlassian.net/browse/SCRUM-58) substituem a interpretação de que uma rejeição isolada deve bloquear estilos automaticamente: edição, escolha, rejeição, reação e exportação são eventos distintos, vinculados à versão e à origem. Comentários posteriores também podem ser sinais; preserve a declaração da pessoa separada da interpretação. A primeira etapa considera ações e conversas da própria pessoa, sem métricas de público. Silêncio, exposição e download não provam aprovação.

O perfil é usado no contexto escolhido. Uma inferência automática, inclusive ambígua, pode modificar uma preferência confirmada; a mudança deve ser comunicada na web e por mensagem MCP, indicar a origem e permitir desfazer, restaurando o valor anterior e registrando a correção. A precisão da inferência e sua aceitação não decorrem da existência do mecanismo.

O resumo individual proposto no Supabase contém identificador, preferências, mudanças, origem, versão e escopo. O envio ao mantenedor exige autorização específica, contínua e revogável; após revogação não há novos envios, e os dados recebidos ficam preservados até decisão de descarte. Textos e imagens integrais exigem autorização separada. O Markdown local identificável deve ser visível, atualizado e conservar histórico e correções. Seu compartilhamento para estudo exige autorização que informe colaboradores e finalidade, acesso restrito e registro de leituras e compartilhamentos. Controles locais, identidade, condições do Supabase e suas políticas precisam ser verificados; um arquivo local, sozinho, não comprova controle de acesso.

Personalização, avaliação, perfis individuais, dados agregados e telemetria têm finalidades e autorizações distintas. Avaliação exige consentimento separado; não implica treinamento de modelo. Promoção da mudança depende de avaliação humana. Busca externa requer autorização específica, referências reais e sintéticas devem ser identificadas, e a pessoa pode seguir sem referência. O motor efetivamente usado e eventuais falhas ou substituições precisam ser visíveis. Medições de cache, latência e custo são necessárias antes de alegar ganhos.

## Texto original — proposta inicial

Em 29/10/2026, Matheus decidiu incorporar ao protótipo `compor-mcp` (em TypeScript) o motor de recomendação e decisão de referências visuais **Phoenix Decision Engine**, operando em arquitetura Two-Tower Retrieval + Candidate-Isolated Ranking + Memória de Preferências em 3 Camadas e expondo respostas adaptativas para dois modos de cliente MCP (`codex` via `stdio`/CLI e `web` via Streamable HTTP/SSE).

O roteamento de busca passa a alocar de 2 a 4 boards curados complementares por papel composicional (`hook_cover`, `structural_grid`, `ui_component`, `conversion_cta` e cota controlada de `wildcard_exploration` em feeds `/feed`) a partir do catálogo canônico verificado do Compor. O ranqueamento avalia cada candidato de forma estritamente isolada (*Candidate Isolation*) após um prefixo fixo da sessão para maximizar o reaproveitamento de KV-Cache (`prompt_cache_key`) e garantir invariância de lote, aplicando em seguida decaimento exponencial de diversidade sobre prefixos repetidos de Identificadores Semânticos Visuais (SIDs). Quando `OPENAI_API_KEY` não estiver definida no modo Codex, o servidor pode solicitar a chave ou delegar a decisão ao subagente `gpt-6-luna`; em suítes de teste, utiliza um motor local determinístico.

Esta decisão sobrescreve a restrição anterior do [ADR 0008](0008-memoria-proativa-e-observabilidade.md) sobre hipóteses estritamente não bloqueantes para o fluxo de recomendação visual: a memória passa a operar em três camadas (vetor de sessão com EMA, bandit Beta-Bernoulli de afinidade por board e perfil de gosto consolidado de longo prazo `user_taste_json`), onde sinais de aprovação e atenção (`locked_as_reference`, `expand_zoom` / `high_dwell`) reforçam o vetor positivo e rejeições (`discard_generic`, `style_mismatch`) alimentam restrições negativas (`negative_constraints`) que penalizam e bloqueiam buscas futuras nos estilos rejeitados.
