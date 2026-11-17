# Contratos visuais e planejamento — verificação local

Data: 17/11/2026. Worktree isolada: `compor-png-planner-contracts`, criada de `702d729`. Node `v24.16.0` em macOS. Fornecedores, identidade e stores simulados; nenhuma chave real ou chamada paga foi usada.

## Evidência executada

- `visual-input.test.mjs`: manifesto estrito, base64 e hash dos bytes, omissão/subconjunto/ordem incorretos, limites/headers, v1 preservado, v2 com origem e subset, fonte de outro projeto e limite de `image_url`. O teste inicial falhou pela ausência do contrato; após implementação passou.
- `exploration-planner.test.mjs` e `exploration-visual-planner.test.mjs`: recuperação, provas por escopo/fonte/chave, inputs multimodais completos, plano v2 com seleção assinada, freeze antes de autorização, recusa de modelo que omite upload, falta/perda da porta autoritativa e recuperação sem novo POST.
- `exploration-planner-route.test.mjs`, `exploration-intent.test.mjs`, `exploration-parallel-resume.test.mjs` e `exploration-visual-routes.test.mjs`: 24 testes aprovados. Incluem transporte maior que o antigo teto de 64 KiB no planner, recusa acima de 3 MiB, poll sem blobs, CAS e retomada vinculados ao manifesto, protocolo legado e clientes sem porta autoritativa.
- `quality:lint`, `quality:typecheck` e `git diff --check`: aprovados nesta worktree antes da entrega; novos testes são executados com `node --test` e, no app, `node --import tsx --test`.
- Suíte completa `npm test --prefix packages/agents-api`: **231/231 aprovados**. A primeira execução encontrou `@compor/agile-deliberation` ausente na worktree nova; após copiar as dependências locais já instaladas, a suíte completa passou sem mudança de teste ou produção para acomodar essa falha.

Os testes de pacotes e rotas são dirigidos e não constituem uma execução completa de `quality:browser`. Build, análise de bundle e gates do head integrado precisam ser registrados pela integração. Não alteramos os orçamentos nem reduzimos checks. A leitura das limitações oficiais de Agents/Vercel e a lacuna de consentimento autoritativo estão no [ADR 0066](../adr/0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md).

## Limites da evidência

O parser do servidor verifica estrutura/cabeçalhos com limites; não decodifica integralmente pixels nem comprova qualidade. Um hash transportado não prova autoria ou origem do arquivo. Os mocks de `authorizeVisualInput` exercitam a fronteira; não implementam a fonte autoritativa, que continua ausente. Runtimes sem essa porta bloqueiam candidatos externos/gerados. Nenhum teste local comprova CI Linux, dados de contas reais, cobrança ou comportamento visual do modelo.
