---
status: proposed
---

# Agents API gerenciada e MCP remoto compartilhado

Em 02/11/2026, Matheus definiu que o Compor deve usar a OpenAI Agents API para gerenciar o loop do agente e conectar suas capacidades por um MCP remoto autenticado na Vercel, compartilhado com o Codex Desktop. A escolha visa reduzir a orquestração própria no backend e manter um núcleo de capacidades acessível aos dois clientes. Não será usado o Agents SDK para executar o loop no backend.

Se a Agents API não oferecer a geração de imagem necessária, uma function tool atendida pelo backend chamará a OpenAI Images API com a chave da sessão da pessoa; tratar essa chamada não transfere o loop para o backend. A autenticação, o isolamento, a conexão do Codex, o uso da chave, a geração e a recuperação ainda requerem prova integrada. O [system design proposto](../system-design-agents-api-mcp.md) registra os contratos, critérios e limitações para revisão.

Se aceita após a revisão integral, esta decisão substituirá a escolha do Agents SDK no [ADR 0007](0007-arquitetura-web-e-byok.md) e a hipótese de MCP no mesmo processo para o agente web no [ADR 0009](0009-mcp-capacidades-compor.md), preservando os demais compromissos aplicáveis. Os ADRs anteriores permanecem inalterados enquanto esta proposta não for aceita. Hospedagem gerenciada reduz a operação do harness, mas não comprova, por si só, compatibilidade, qualidade, custo ou segurança da implementação.
