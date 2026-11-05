---
status: recorded
date: 2026-11-05
---

# MCP remoto e stdio com fronteiras explícitas

## Contexto e registro

O Compor mantém um servidor remoto autenticado em `packages/remote-mcp` e um protótipo stdio em `prototypes/compor-mcp`. Este ADR registra a separação implementada em 05/11/2026 a pedido de Matheus. Compartilhar o protocolo não iguala identidade, armazenamento ou autorização dos dois servidores.

`/api/mcp` integra o transporte HTTP ao Next. Cada operação exige identidade verificada e escopo de dados. `/api/agent-mcp` acrescenta uma delegação limitada ao projeto, com credencial distinta da BYOK e das assinaturas de outras operações. OAuth/discovery depende da configuração explícita do ambiente.

O stdio mantém identidade local e capacidades experimentais de filesystem e Phoenix. Essas capacidades não são publicadas automaticamente no remoto. Reutilizar código exige extrair contratos adequados ao serviço multiusuário, sem transportar a autoridade do processo local.

## Metodologia compartilhada

Ambos registram `prepare_deliberation` e `propose_criterion_refinement`, de `packages/agile-deliberation`. São operações puras: recebem contexto autorizado, devolvem comparação ou proposta e não persistem uma decisão humana. Declarações de escolhas reportadas pelo cliente não autenticam sua autoria.

O agente web usa as mesmas instruções da metodologia. A ponte local de ferramentas do estúdio não é um transporte MCP remoto. O catálogo da web e o catálogo MCP podem ter operações diferentes, desde que seus contratos e limites sejam explícitos.

Os originais do Google ficam em `third_party`; os derivados identificam a modificação. A licença, o commit fixado, os hashes e o [mapa de incorporação](../agile-deliberation.md) acompanham o código. O [ADR 0013](0013-agile-deliberation-no-mcp.md) preserva a decisão de adaptação.

## Verificação

Testes exercitam o transporte Streamable HTTP, autorização por chamada, revogação, escopo de projeto e negociação stdio em processo real. Não comprovam configuração de OAuth ou acesso de todo cliente externo em produção. Acrescentar uma ferramenta requer schema, fronteira de autoridade e teste de comportamento no transporte onde será oferecida.
