---
status: accepted
---

# Motor de recomendação visual Phoenix e adaptação MCP Dual

Em 29/10/2026, Matheus decidiu incorporar ao protótipo `compor-mcp` (em TypeScript) o motor de recomendação e decisão de referências visuais **Phoenix Decision Engine**, operando em arquitetura Two-Tower Retrieval + Candidate-Isolated Ranking + Memória de Preferências em 3 Camadas e expondo respostas adaptativas para dois modos de cliente MCP (`codex` via `stdio`/CLI e `web` via Streamable HTTP/SSE).

O roteamento de busca passa a alocar de 2 a 4 boards curados complementares por papel composicional (`hook_cover`, `structural_grid`, `ui_component`, `conversion_cta` e cota controlada de `wildcard_exploration` em feeds `/feed`) a partir do catálogo canônico verificado do Compor. O ranqueamento avalia cada candidato de forma estritamente isolada (*Candidate Isolation*) após um prefixo fixo da sessão para maximizar o reaproveitamento de KV-Cache (`prompt_cache_key`) e garantir invariância de lote, aplicando em seguida decaimento exponencial de diversidade sobre prefixos repetidos de Identificadores Semânticos Visuais (SIDs). Quando `OPENAI_API_KEY` não estiver definida no modo Codex, o servidor pode solicitar a chave ou delegar a decisão ao subagente `gpt-6-luna`; em suítes de teste, utiliza um motor local determinístico.

Esta decisão sobrescreve a restrição anterior do [ADR 0008](0008-memoria-proativa-e-observabilidade.md) sobre hipóteses estritamente não bloqueantes para o fluxo de recomendação visual: a memória passa a operar em três camadas (vetor de sessão com EMA, bandit Beta-Bernoulli de afinidade por board e perfil de gosto consolidado de longo prazo `user_taste_json`), onde sinais de aprovação e atenção (`locked_as_reference`, `expand_zoom` / `high_dwell`) reforçam o vetor positivo e rejeições (`discard_generic`, `style_mismatch`) alimentam restrições negativas (`negative_constraints`) que penalizam e bloqueiam buscas futuras nos estilos rejeitados.
