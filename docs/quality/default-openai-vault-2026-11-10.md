# Preparação da chave padrão OpenAI no Vault

## Contrato verificado

Fonte de código: `97e56f47594993aab24d0fe23d8dd1e9950ade00`, sobre `main` em `ff1ce93`. O usuário informou o nome definitivo `COMPOR_CIN_OPENAI`; seu valor não foi lido nesta preparação. A migration 28 e seu teste permanecem com os mesmos bytes validados e entram em commit próprio por último. O [ADR 0038](../adr/0038-chave-padrao-openai-no-vault.md) registra a decisão e o [procedimento operacional](../compor/chave-padrao-openai-vault.md) separa cadastro, habilitação e teste real.

BYOK presente tem prioridade, inclusive quando inválida; falha não troca de credencial. A padrão é resolvida só no servidor, após origem, identidade e propriedade. O status global, autenticado e sem cache, retorna somente disponibilidade, sem chamada OpenAI. O privilégio administrativo é usado apenas na RPC fixa; os dados continuam com token da pessoa e RLS. O MCP externo não ganhou fallback.

Novas provas vinculam fonte e credencial efetiva, com assinaturas separadas do legado e MAC específico por prova. Remover o envelope não produz prova BYOK legada válida; trocar partes ou usar outra chave falha antes de consultar fornecedor. O formato público continua com três segmentos, compatível com os contratos SQL. Os casos de tamanho revisados, com IDs e inteiros extremos, ficaram entre 822 e 1.775 caracteres, abaixo de 2.048; isso é a matriz exercitada, não promessa de máximo matemático para todo contrato futuro.

A compatibilidade histórica BYOK é explícita: provas anteriores não podem ser vinculadas retroativamente à chave original. Aprovação de uma ação histórica ainda pode emitir `v6` legado, exclusivamente nesse fluxo. A reconciliação local verifica assinatura interna e propriedade sem precisar da chave, e expõe somente a verificação necessária ao bloqueio SQL, sem chamar fornecedor.

## Experiência e imagens

A padrão exige intenção para o projeto na sessão; login, status, abertura e recarga não iniciam consumo por ela. BYOK explicitamente conectada conserva a autorização histórica por sessão. A troca de credencial pausa solicitações, invalida só a continuidade antiga e preserva conversa, rascunho, pendências e recibos. Resultados incertos, pergunta de seleção e limite de rodadas permanecem bloqueios.

O formulário completo ficou na etapa de conexão. Na conversa permanecem fonte/status e ações compactas. O controlador de altura compartilha limites entre aplicação, arraste, teclado e ARIA: com detalhes visíveis em viewport baixo, mínimo de 260 px dentro da área útil; ocultos permitem 180 px. A captura de geometria e ARIA é atômica, depois da prontidão do resize, sem ampliar timeout.

O diretor de AX conferiu e aprovou três capturas sintéticas, copiadas sem edição. Seus hashes e a fonte estão no [manifesto](default-openai-vault-2026-11-10/captures.json):

| Estado | Evidência |
| --- | --- |
| Painel em 742×720 | [Captura](default-openai-vault-2026-11-10/742x720.png); campo 659–695 dentro do painel 358–704 |
| Painel em 390×400 | [Captura](default-openai-vault-2026-11-10/390x400.png); painel 124–384, campo 339–375, ARIA mínimo/atual 260 e máximo 368 |
| Detalhes ocultos, redução manual | [Captura](default-openai-vault-2026-11-10/390x400-hidden.png); altura 180, compositor contido |

O aceite é desses estados. Não comprova todos os textos, tamanhos de tela, contas reais ou qualidade criativa. A correção posterior de uma guarda assíncrona de imagem não alterou os estados visuais capturados.

## Gates locais

Linux, Node 24.19.0, Next 16.4.4/Turbopack e Chromium 151. Instalações com `--ignore-scripts`, sem nova dependência, upgrade ou alteração de orçamento.

| Verificação | Resultado |
| --- | --- |
| Lint e TypeScript | Aprovados |
| `quality:test` | 23/23; inclui o SQL/PGlite do Vault |
| Contratos dos pacotes | 454/454 Node e 22 testes Python |
| Navegador cumulativo | 357/357, sem falhas, cancelamentos ou skips; 356,47 s |
| Build de produção | Aprovado |
| Análise de todas as rotas | Exportada e conferida |
| Performance | Aprovada em cinco navegações da entrada sem sessão |

Os 19 testes focados de resolver/admissão/provas também integram a suíte web. O SQL exercita ausência do Vault, alvo fixo, chave inválida/ambígua, bloqueio dos papéis comuns e defesa contra um grant indevido. Os testes de navegador usam sessão, chave, imagens e fornecedores sintéticos; não fizeram chamadas pagas.

As falhas foram investigadas antes de nova execução. O formulário inline empurrava o compositor em viewport compacto; mover o formulário e unificar o controlador resolveu a geometria. A primeira suíte completa passou 354/357: dois casos ainda usavam o painel/rótulo anterior, e a conversão de PNG grande conservava uma comparação com o marcador sem fonte/época. Os setups foram atualizados mantendo asserts; a guarda passou a verificar o escopo completo. Os três focos passaram antes da segunda suíte completa, que aprovou 357/357. O limite de 8 s da edição grande e os demais prazos permaneceram iguais.

Uma revisão independente também encontrou falha pré-envio do Vault que deixava uma tentativa inexistente marcada como incerta. O servidor agora emite sinal estrito e correlacionado apenas para envio novo; o cliente exige fonte padrão, mesmo request ID e schema exato. Polls, ações, recuperação e falhas genéricas continuam conservadores. Não há liberação genérica de resultado desconhecido.

## Bundle e dependências cliente

Auditoria `next-bundle-optimizer`, modo audit, de todas as rotas e saídas cliente, incluindo async. Antes: snapshot salvo `codex-variants-26-validated`, cujo código de runtime é idêntico ao `main` de base; exportação `/workspace/scratch/compor-vault-before.jsonl.gz`. Depois: `codex-vault-default-validated`, exportação separada `/workspace/scratch/compor-vault-after.jsonl.gz`. Ambas usam `pipefail`, gzip padrão e o schema do Next instalado. Partes repetidas `(filename, source_path)` contam uma vez.

| Medida | Base | Preparação Vault |
| --- | ---: | ---: |
| JS inicial sem sessão, gzip | 0 | 0 |
| JS total, gzip por arquivo | 288.022 | 290.417 |
| Folga até 300.000 | 11.978 | 9.583 |
| Atribuição em saídas cliente | 352.102 | 354.964 |

O incremento é 2.395 bytes gzip por arquivo e 2.862 bytes atribuídos. As medidas têm definições diferentes e não equivalem a tráfego observado. As cinco navegações mediram LCP mediano de 639,98 ms, TBT mediano zero (máximo 12 ms) e CLS de 0,00801457. Não medem o Estúdio autenticado, a geração ou o custo OpenAI.

Há 35 rotas indexadas, três bootstraps cliente e 27 referências cliente nas entradas. As 26 associações exatas e seis `not_a_chunk` não têm output `unsupported` ou grupo sem associação. Módulos concatenados continuam limitando a associação individual: o hook novo aparece nas partes emitidas dentro da composição do Workspace, sem novo membro exato. O scan combina membros, partes e chunks efetivos, evitando concluir ausência só pelo nome de um módulo.

Na tabela, identidades indexadas usam `[project]/apps/web/<fonte> [app-client]`; os bytes são partes comprimidas deduplicadas. Todos os matches abaixo foram suprimidos após conferir fonte e importador:

| Fonte + importador | Bytes | Disposição |
| --- | ---: | --- |
| `app/use-ai-credentials.tsx` ← `workspace.tsx` | 1.453 | UI de fonte, intenção e BYOK em memória; não importa resolver, RPC ou credencial administrativa |
| `lib/session-state.ts` ← Workspace | 295 | Parser público do status da sessão |
| `lib/reference-session-consent.ts` ← Workspace/referências | 182 | Preferência de consentimento, sem token |
| Agile `exploration.js` ← loop | 2.042 | Planejador público, sem execução do fornecedor |
| Agile `readiness.js` ← chat | 998 | Hipótese pública de prontidão |
| Agents `image-proposal.mjs` ← arte/chat | 665 | Contrato público da proposta |
| Agents `studio-chat-tools.mjs` ← chat/ferramentas | 2.646 | Definições públicas; autoridade permanece no servidor |
| Next `unauthorized.js` ← navegação | 314 | Helper público do framework |
| Next `async-local-storage.js` ← work-async-storage-instance | 422 | Shim público de navegador |
| Next `work-async-storage-instance.js` ← work-async-storage.external | 188 | Shim público do framework |
| Next `work-async-storage.external.js` ← preload-chunks | 151 | Shim público do carregamento lazy |

Não há Server Action importada pelo cliente do app. Nenhum vazamento de módulo exclusivo de servidor foi identificado: `default-openai-key.ts`, `openai-credential.ts`, `openai-credential-bindings.ts` e `web-openai-credential.ts` não aparecem em membros nem partes cliente. Os chunks efetivos não contêm `SUPABASE_SERVER_KEY`, `COMPOR_CIN_OPENAI` ou `compor_default_openai_key`. Não houve inspeção do segredo real. As limitações de associação dos seis outputs continuam explícitas; não há alegação de cobertura perfeita de runtime.

Não foi proposto corte de dependências. Os alvos são conhecidos, o orçamento passou e comunidades/min-cut não acrescentariam descoberta útil nesta comparação de feature.

## Escopo de publicação

Esta entrega prepara um PR aberto para `main`; não aplica a migration 28, não provisiona credenciais e não habilita a flag em produção. O usuário informou a criação do segredo, que ainda depende da leitura autorizada e da configuração do servidor no ambiente escolhido. CI remoto do head publicado continua necessário.

Em tarefa paralela solicitada por Matheus, o empacotamento do **main anterior** foi corrigido e validado em [preview READY](https://compor-marco0-8m56y9njr-math-ai2.vercel.app). Os 229 caminhos preservam `apps/web/`; build, tipos, entrada e SVG passaram, com os dois aliases de produção no deployment anterior. Esse preview não contém esta integração Vault e não comprova flags/login/modelo real de produção.

Logs e artefatos locais: `/workspace/scratch/vault-{lint-final,types-final,quality-test,unit,browser-final,build,analyze,performance}.log`, `vault-bundle-summary.json`, `vault-client-roots.json`, `vault-performance/` e `compor-vercel-root-fix.json`. As execuções anteriores que falharam permanecem separadas em `vault-byok-brief-browser.log`, `vault-browser-full.log` e nos focos de navegação/arte.

## Correção após o merge

O usuário integrou o PR 44 em `d638b0d9e364c741993f4da4183580ad12dd2730` e pediu um deployment. O CI 58 do head `4e09e4a` terminou com 355/357 testes web aprovados, duas falhas e nenhum skip; estático, contratos e performance passaram. O preparo BYOK recebia o HTTP 200 da entrada sem sessão antes de compilar o App Router autenticado; agora usa o helper existente com cookie e leitura dos assets. A fixture de fonte editava uma textarea renderizada no servidor antes da hidratação; agora aguarda um sinal publicado por `useEffect`. Os asserts e limites permanecem iguais. Os dois focos corrigidos passaram localmente em 14,83 s, sem chamadas externas.

Por decisão do diretor de AX, `unknown/provider_http_401` da padrão agora orienta consultar o resultado antes de iniciar outra solicitação, sem sugerir troca de chave. O teste conserva a pendência e sua fonte, permite editar o rascunho e exige o bloqueio de novo envio. A mensagem histórica da BYOK permanece.

O [workflow de migrations do merge](https://github.com/MathBorgess/compor/actions/runs/42803139907) confirmou `COMMIT` e uma migration aplicada. As variáveis `SUPABASE_SERVER_KEY` e `COMPOR_DEFAULT_OPENAI_ENABLED` não constavam na Vercel durante a conferência de metadados; nenhum valor foi consultado. A solicitação atual prepara um novo preview do main corrigido, mantendo a padrão desativada e os domínios protegidos no deployment anterior. As evidências iniciais acima continuam identificadas pelo commit em que foram medidas.
