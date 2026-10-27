---
status: accepted
---

# MCP próprio para as capacidades do Compor

Em 27/10/2026, Matheus decidiu que o agente único do Compor acessará as capacidades por um MCP próprio já na v0. A primeira opção a testar para o agente do app é a comunicação MCP no mesmo processo do backend. MCP Apps fica para uma etapa posterior. A equipe pode desenhar, criar e testar o MCP localmente em seus harnesses em paralelo ao protótipo de design; o uso interno inicial no produto não impede esses testes de desenvolvimento.

O servidor deve carregar skills versionadas e expor operações conforme contratos e permissões da aplicação. O protocolo é uma fronteira de integração: não concede autorização, não garante que o agente siga as instruções, nem transforma automaticamente as operações em recursos públicos. Autenticação, isolamento, acesso de clientes remotos, configuração de produção e transporte alternativo permanecem em discussão e sujeitos a testes. A BYOK não deve aparecer em resultados ou traces.

A opção inicial é uma prova no mesmo processo; a equipe também pode usar um transporte local para exercitar o servidor a partir de um harness. A [documentação do Agents SDK](https://openai.github.io/openai-agents-js/guides/mcp/) descreve clientes MCP e ciclo de vida; o [SDK MCP](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md) documenta um exemplo de handler chamado por `fetch` no próprio processo. A combinação concreta, suas versões, isolamento e comportamento no runtime do app precisam ser verificados. Um servidor HTTP no mesmo deploy não é privado por padrão. O [MCP Apps](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html) é uma extensão visual opcional e fica fora do primeiro passo.

A motivação é permitir que a equipe evolua e avalie o núcleo agentic independentemente da interface e, futuramente, possa oferecer capacidades a outros harnesses. O custo adicional é gerenciar ciclo de vida do MCP, autorização, compatibilidade e observabilidade. Um teste real deve verificar negociação do protocolo, descoberta e chamada de ferramentas; uma chamada direta a funções não comprova integração MCP. A integração com Agents SDK/Next.js/Vercel, as capacidades de produto e eventuais acessos externos não estão implementados ou comprovados por esta decisão.
