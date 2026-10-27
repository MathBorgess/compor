---
status: accepted
---

# Aplicação web com BYOK e dados gerenciados

Em 27/10/2026, Matheus optou por uma v0 no navegador, com conexão obrigatória, Next.js na Vercel, login inicial pelo Google e Supabase Free como candidato para PostgreSQL, autenticação e arquivos privados. Um único agente usa o OpenAI Agents SDK com skills e tools, sem subagentes; cada pessoa usa sua chave OpenAI, com salvamento protegido opcional, e a chave da equipe fica restrita aos testes. Busca vetorial com pgvector apoiará a recuperação de memórias por escopo e bases aprovadas, sujeita à validação de acesso e custo. O piloto poderá ser baixado em PNG, com texto copiado; a memória não terá exportação na v0.

O sistema solicita uma imagem sem texto; textos, preços e datas permanecem editáveis no app, separados da imagem, e são compostos no PNG. A solicitação não garante o resultado: se houver texto inesperado na imagem, a pessoa o revisa antes de usar. O piloto começa com a equipe; convidados externos entram após a verificação da autenticação, da proteção dos dados e das condições dos serviços.

A escolha simplifica o acesso e o setup em comparação com o aplicativo instalado e o vault sincronizado. Substitui parcialmente os [ADRs 0001](0001-contexto-local-e-colaboracao-github.md), [0002](0002-organizacao-e-fluxo-individual.md) e [0003](0003-memoria-integral-da-organizacao.md), e substitui os perfis de teste do [ADR 0004](0004-tres-perfis-de-teste.md); os registros anteriores permanecem históricos. Os requisitos não conflitantes continuam candidatos aplicáveis e a reconciliação da spec permanece pendente. Custos, limites dos planos, segurança das credenciais, isolamento, integração e recuperação precisam de validação; esta decisão não aprova a arquitetura integral nem comprova implementação.
