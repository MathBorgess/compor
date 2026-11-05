---
status: recorded
date: 2026-11-05
---

# Backend como fronteira de identidade, dados e execução

## Contexto e registro

Este ADR registra a implementação observada em 05/11/2026, conforme pedido de Matheus para explicitar a arquitetura. Não altera autorizações de dados, configurações remotas ou o status de propostas anteriores.

Handlers TS em `apps/web/app/api` e adaptadores de `apps/web/lib` compõem os serviços. Pacotes em `packages` implementam os contratos reutilizáveis, sem importar componentes do Next. Supabase Auth fornece a identidade; Postgres e Storage mantêm dados duráveis privados, com RLS e verificação de propriedade por operação.

Projetos, versões, imagens e metadados técnicos de execução são duráveis. Rascunhos, persona, critérios, referências e conversa do primeiro marco ficam no navegador por conta/projeto. A sessão gerenciada na OpenAI é outro domínio de retenção. Não se deve confundir esses três locais de persistência.

## Invariantes

- A identidade deriva da sessão verificada. IDs e argumentos recebidos não concedem acesso. As chamadas de dados preservam o token da pessoa e as políticas RLS.
- BYOK é temporária. Não é identidade Compor, não é persistida e não entra em logs ou contexto de ferramentas.
- Operações de imagem vinculam proposta, aprovação, bytes, origem e versão. Reservas e recibos permitem reconciliar resultados sem prometer cobrança exatamente uma vez.
- Versão esperada impede sobrescrita silenciosa. Edição cria nova versão e preserva a origem. Download, geração, armazenamento e aprovação são ações distintas.
- Resultado desconhecido é conservado como desconhecido. Não repetir automaticamente uma geração paga após timeout sem reconciliação.

## Verificação e limites

Testes HTTP, de contratos, SQL e de Storage exercitam origem, acesso cruzado, concorrência esperada e recuperação. O CI usa fixtures e bancos locais de teste; não comprova por si só políticas aplicadas num Supabase remoto nem isolamento com duas contas reais. Mudanças de schema/RLS precisam de revisão e evidência apropriada antes da aplicação.

Consulte [arquitetura atual](../architecture.md), [proteção de dados](../compor/isolamento-e-protecao-dados-marco0.md) e [arte integral](0012-arte-integral-e-deliberacao-adaptativa.md).
