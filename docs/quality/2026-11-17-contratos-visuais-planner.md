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

## Revisão da ordem de verificação antes do envio

Na bancada `compor-visual-dispatch-intent-race`, baseada em `652e19b`, dois testes controlados suspenderam a revalidação de autoridade visual após a reserva, revogaram a intenção e então liberaram a consulta. Antes da correção, lote e reposição ainda enviavam e retornavam `completed`. A consulta da intenção agora acontece após a autoridade visual, como última verificação antes de cada envio. Os dois testes passaram, preservando os recibos como `unknown`, sem envio nem repetição em replay; a suíte da rota passou **21/21**, ESLint do arquivo alterado, tipos estritos sem emissão e `git diff --check` também passaram.

Essa ordem fecha a janela reproduzida entre os dois awaits; não oferece atomicidade entre banco e rede nem cancela uma chamada já admitida pelo fornecedor. A porta autoritativa real continua ausente e os flags não foram alterados. A evidência usa apenas fixtures locais.
