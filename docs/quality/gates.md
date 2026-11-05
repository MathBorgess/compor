# Gates de qualidade

O workflow [Quality](../../.github/workflows/quality.yml) executa em cada pull request, push para `main` e execução manual. O check agregado **Quality gate** passa somente quando os cinco jobs terminam com sucesso. Falha, cancelamento ou job ignorado bloqueiam o agregado. O workflow não altera a proteção da branch. Essa proteção precisa exigir **Quality gate** para impedir merges sem os checks.

| Job | Condição de aprovação | Escopo |
| --- | --- | --- |
| Static checks | ESLint sem erros ou avisos e testes do avaliador de orçamento aprovados | TypeScript/TSX do app web, JavaScript dos pacotes e scripts de qualidade |
| Contracts and data isolation | Todas as suítes dos pacotes e dos scripts Python aprovadas | Autorização, isolamento, idempotência, persistência, recuperação e contratos com fornecedores simulados |
| Web types and behavior | TypeScript estrito, Chromium instalado e toda a suíte web aprovada | Navegação, interação e estados do app com fixtures locais |
| Public site build | `astro check` e build aprovados | Site público e seus headers de saída |
| Production performance | Build Next de produção e todos os limites abaixo aprovados | Entrada `/` sem sessão, com configuração pública sintética |

As instalações usam `npm ci --ignore-scripts` e lockfiles versionados. Os jobs não recebem secrets e não fazem deploy. O token tem somente `contents: read`. As Actions usam SHAs fixos. Chromium vem da versão de Playwright fixada no lockfile web. `BROWSER_EXECUTABLE_PATH` aponta para esse executável, e o preflight falha se ele estiver ausente. Os testes de migração recebem o histórico Git completo e um cliente `psql`, sem banco externo.

Nos preparos de migração, `READ_COMMIT` identifica os bytes em um commit publicado; `SOURCE_COMMIT` e `SOURCES` preservam os IDs históricos registrados na auditoria. Os hashes e as guardas continuam obrigatórios. Uma regressão executa os preparos em um checkout sem os commits locais antigos e exige os mesmos oito arquivos SQL/proof, byte a byte. Os [hashes preservados e a falha que motivou a separação](migration-pins-2026-11-05.md) estão registrados.

No Ubuntu 24.04, o job de Lighthouse carrega um perfil AppArmor que permite `userns` somente ao caminho exato do Chromium instalado. Isso permite iniciar o sandbox do navegador baixado pelo Playwright, que não usa o caminho coberto pelo perfil do Chrome do sistema. O job mantém AppArmor ativo e não passa `--no-sandbox` ao Lighthouse. A configuração segue a [orientação do Chromium para perfis AppArmor](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md) e existe somente no runner temporário.

## Correção e manutenção

O TypeScript verifica o app Next com `strict: true` e sem ignorar erros no build. Componentes usam TSX; rotas e lógica usam TS. `quality:typecheck` bloqueia erros de contrato antes dos testes do navegador. O ESLint bloqueia `any` explícito, supressões TypeScript e arquivos JavaScript de produção em `apps/web/app` e `apps/web/lib`. Testes e ferramentas podem continuar em MJS.

Dados de HTTP, storage e ferramentas passam por schemas em runtime. Declarações `.d.ts` descrevem os pacotes compartilhados ainda escritos em JavaScript; elas verificam seus consumidores TypeScript, mas não substituem os testes das implementações desses pacotes. O estúdio usa importação dinâmica após a sessão para reduzir o código carregado na entrada.

O ESLint aplica as regras recomendadas de correção, incluindo nomes inexistentes, propriedades duplicadas e expressões ambíguas entre linhas. Variáveis e imports sem uso bloqueiam arquivos TypeScript, TSX, JavaScript e MJS. Argumentos e erros capturados podem ficar sem uso. A verificação de uso está desativada em JSX porque o parser básico não reconhece imports usados somente nas tags JSX. Não há mudanças de formatação obrigatórias.

`no-empty` permite blocos `catch` vazios usados nas rotas de recuperação existentes. `no-control-regex` está desativada porque os validadores existentes examinam caracteres de controle. Essas exceções são explícitas em [eslint.config.mjs](../../eslint.config.mjs).

`quality:maintenance` gera um relatório de complexidade ciclomática por função, com arquivo e linha. Valores acima de 20 são candidatos para revisão. Não bloqueiam o PR e não autorizam uma extração mecânica. A [calibração inicial](baseline-2026-11-05.md) registra os maiores valores. Os contratos determinísticos continuam sendo o gate de comportamento durante refatorações.

As dependências de qualidade ficam no pacote privado da raiz. Não entram no bundle da aplicação. O override de `minimatch` fixa a versão corrigida `11.0.4` para a árvore do ESLint 10, devido ao [advisory GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Orçamento de performance

Os valores usados pelo gate estão em [budgets.json](../../scripts/quality/budgets.json).

| Medida | Limite inclusivo | O que é contado |
| --- | --- | --- |
| JavaScript inicial | 250.000 bytes gzip | Soma dos scripts externos únicos presentes no HTML de `/` |
| JavaScript de todos os chunks | 300.000 bytes gzip | Soma de todos os arquivos `.js` em `.next/static` |
| Largest Contentful Paint | 2.500 ms | Mediana de cinco navegações mobile simuladas |
| Total Blocking Time | 200 ms | Mediana das mesmas cinco navegações |
| Cumulative Layout Shift | 0,1 | Mediana das mesmas cinco navegações |

Os tamanhos usam gzip de cada arquivo, sem headers HTTP. Não equivalem aos bytes transferidos por uma CDN com Brotli. O limite total inclui chunks de outras rotas e os carregados sob demanda. Ele impede que mover código para um import dinâmico esconda crescimento ilimitado do cliente.

O script inicia um servidor de produção em uma porta local disponível e um perfil temporário do Chromium. Lighthouse usa emulação mobile, throttling simulado e reset de armazenamento. Cada relatório guarda a configuração efetiva, versão e avisos. A coleta registra a resposta HTTP da página e recusa redirecionamento para outra rota, erro do Lighthouse, erro no console ou métrica ausente. Não aceita uma página de erro como uma página rápida.

Os limites de LCP e CLS usam os valores de referência publicados pelo Google. O limite de TBT usa a faixa mobile do Lighthouse. A mediana de laboratório não substitui o percentil 75 observado em usuários reais. [LCP](https://web.dev/articles/lcp), [CLS](https://web.dev/articles/cls), [TBT](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time).

Os relatórios incluem acessibilidade e boas práticas para diagnóstico, sem impor uma nota agregada. Os artefatos `production-performance` e `maintainability` ficam disponíveis por cinco dias. Localmente, ficam em `quality-results/`, fora do Git. O job web também guarda `studio-screenshots` por cinco dias: são capturas desktop/mobile com dados sintéticos, para revisão visual, sem comparação automática com o Figma.

## Limites da cobertura

O benchmark não autentica no Google, não consulta um projeto Supabase e não chama o GPT Image. Ele não mede latência de rede real, geração de imagem, interação autenticada, INP de campo ou acessibilidade completa. Os contratos usam fornecedores simulados para verificar chamadas, autorização e recuperação sem custos externos.

A escolha entre SSR e conteúdo estático depende dos dados da rota. No ponto de partida, o Next renderiza `/` sob demanda e o Astro gera o site público estaticamente. O gate valida o build e o resultado observado, sem exigir que dados de sessão sejam convertidos em conteúdo estático.

O orçamento torna visível o custo de novas dependências. Componentes pesados opcionais podem usar [lazy loading do Next](https://nextjs.org/docs/app/guides/lazy-loading). Imagens públicas podem usar [`next/image`](https://nextjs.org/docs/app/api-reference/components/image) quando o formato e a entrega permitirem. As imagens privadas geradas têm regras próprias de acesso e integridade. O workflow não reescreve esses fluxos automaticamente.

## Comandos locais

| Comando na raiz | Pré-requisito | Saída |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Node 24 | Ferramentas de qualidade fixadas no lockfile |
| `npm run quality:lint` | Instalação da raiz | Erros de correção e imports sem uso |
| `npm run quality:typecheck` | Instalação web | Checagem TypeScript estrita do app Next |
| `npm run quality:test` | Node 24 | Testes de rejeição de páginas inválidas e limites excedidos |
| `npm run quality:maintenance` | Instalação da raiz | `quality-results/maintainability/complexity.json` |
| `npm run quality:unit` | Instalação dos pacotes `private-images` e `remote-mcp`, Python 3, `psql` e histórico Git completo | Resultados dos testes de pacotes e migrações |
| `npm run quality:browser` | Instalação web e `remote-mcp`, `BROWSER_EXECUTABLE_PATH` definido | Suíte web completa |
| `npm run quality:build` | Instalação web | Build Next de produção |
| `npm run quality:performance` | Build de produção, instalação da raiz e browser definido | Bundle, cinco relatórios HTML e JSON, resumo e log do servidor |

O comando de instalação do navegador usado no CI é `npx --no-install playwright-core install --with-deps chromium`, executado em `apps/web`. O caminho vem de `chromium.executablePath()` do pacote instalado. O workflow contém a sequência completa para uma máquina nova.
