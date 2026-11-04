# Compor — continuidade do marco 0

**Estado em 3 de novembro de 2026:** trabalho local baseado no commit `47ec05f`, para revisão; não há demonstração E2E do produto nem deploy autorizado. A especificação é [marco 0](../specs/2026-11-02-marco-0-backend-agents-mcp.md). Não interpretar código, testes ou este registro como conclusão de tarefas no Jira.

## Implementado parcialmente

- O app Next.js possui login Google/Supabase, chave OpenAI mantida apenas em memória na aba, projetos e versões de peças com resolução explícita de conflito. O campo da chave não a valida nem inicia geração; `/api/agent` permanece fechado com 503.
- O MCP HTTP possui ferramentas de briefing, projetos e versões. OAuth do Supabase, descoberta e consentimento são experimentais e desativados por padrão; a conexão real e a transferência de imagens pelo Codex Desktop não foram comprovadas.
- O editor compõe e baixa PNG no navegador a partir de uma imagem local cujo uso a pessoa confirmou. A base existe somente em memória e não fica vinculada à versão salva; download não é aprovação. Há adaptador separado para Storage privado, ainda não conectado ao produto.
- Agents API, Images API, reserva de chamada, declaração de consentimento e estimativa de custo existem como recortes internos. Não há execução integrada da função de imagem, reconciliação de resultado nem observabilidade persistente. Estados incertos não são prova de falha e não devem gerar retry automático.

## Evidência e limites

- **OpenAI real, sintética e separada:** o [registro da prova](2026-11-03-validacao-sintetica-openai.md) informa Agents API HTTP 201 e Images API HTTP 200 com `gpt-image-2.5-flare`, qualidade `low`; não testa o adaptador, a qualidade `auto` ou a jornada completa. Foram autorizados até **US$ 5 no total**; a imagem foi estimada em US$ 0,00596, enquanto custo do agente e total faturado são desconhecidos. A autorização não equivale a crédito ou gasto remanescente comprovado.
- **SQL relatado:** Matheus informou que o script de teste isolado terminou com `ROLLBACK`; a saída completa não foi observada pelo agente. O [registro](2026-11-03-supabase-rls-validacao.md) delimita o relato aos snapshots das três primeiras migrações. Não demonstra aplicação durável nem Storage, OAuth ou E2E. As migrações propostas não foram comprovadamente aplicadas de forma persistente.
- **Simulações:** testes de navegador/HTTP usam serviços e imagens sintéticos; PGlite exercita SQL e RLS em uma conexão. O [plano de concorrência](2026-11-03-concorrencia-reserva-imagem.md) com conexões PostgreSQL independentes não foi executado. Isolamento em Supabase/Storage reais, OAuth, Codex e integração pelo produto permanecem sem prova.

## Vínculo de sessão experimental

O adaptador interno lê o stream até `requires_action`, consulta a sessão na OpenAI com a mesma chave transitória e retorna proposta para consentimento, mantendo a tentativa `started`. Uma atestação HMAC temporária vincula conta, projeto, tentativa, sessão, turno, chamada e digest do prompt. A chave de assinatura do backend ainda não foi provisionada; a prova não substitui autenticação, autorização, consentimento ou nova consulta da ação pendente. Perda/expiração da prova ou queda antes de seu retorno não têm recuperação durável implementada. A rota permanece fechada e nenhum teste comprova a execução real dessa ferramenta.

## Próximos passos

1. Revisar a segurança e validar as migrações e políticas em ambiente isolado com duas contas, concorrência real entre conexões e testes de Storage, registrando evidência observada.
2. Conectar escolha explícita à ação verificada, revalidar sessão/chamada e digest, reservar antes de gerar, persistir o asset e o resultado por tentativa e reconciliar interrupções sem retry automático.
3. Integrar medições duráveis de agente, imagem e infraestrutura quando disponíveis; exibir uso/custo desconhecidos e conferir a fatura separadamente.
4. Demonstrar login, OAuth/refresh/revogação, Codex sem chave web, transferência autorizada e jornada app + MCP completa, com testes de isolamento, falhas e revisão humana.
5. Preparar a implantação para revisão; **deploy e entrada de convidados dependem de autorização específica**. Manter evidências de testes simulados, relato e operação real claramente separados.
