# Referências focadas e perfil preservado

Em 16/11/2026, Matheus escolheu a proposta 2 e autorizou implementar a galeria, o fluxo até o primeiro post e a exclusão de projetos preservando aprendizados. O [ADR 0058](../adr/0058-referencias-focadas-e-aprendizados-do-perfil.md) define o contrato final. A [revisão visual](../../design-qa.md) registra capturas e medidas.

## Resultado

Referências agora tem uma página dedicada, fonte explícita, imagens quadradas sem corte, checkbox independente da ampliação e conversa sob demanda. A primeira preparação vai diretamente ao pedido do post. O catálogo só muda com recibo confirmado; reabrir referências mantém o post e a conversa.

O menu da conta oferece **Seu perfil** mesmo sem projetos ativos. Escolhas, comentários, correções e critérios conservam sua origem. Excluir um projeto remove sua entrada da lista, com confirmação e preservação local, sem apagar esses registros. Sinais remotos usam a sessão pessoal e RLS. Critérios do IndexedDB aparecem como **Neste navegador**. Não há inferência de preferência geral nem nova migração.

O aviso de estabilização reflete a programação e o cancelamento do timer existente de 5 segundos. Digitar ou sair das referências remove o aviso e cancela essa espera. A fonte e a ampliação não criam um novo controlador. O intervalo de 15 segundos entre lotes continua observável e não anuncia cada segundo ao leitor de tela.

## Evidências locais

| Verificação | Resultado |
| --- | --- |
| `npm run quality:lint` | Aprovado |
| `npm run quality:typecheck` | Aprovado |
| `npm run quality:unit` | 473 testes Node e 22 Python aprovados |
| `npm run quality:test` | 26 aprovados, incluindo retenção sob RLS em PGlite |
| `npm run quality:browser` | 479 aprovados, zero falhas, cancelamentos ou pulos |
| Perfil após ajuste de carregamento/bundle | 8 testes adicionais de contrato, componente e exclusão aprovados |
| `npm run quality:build` | Aprovado sobre o código final |
| `npm run quality:performance` | Aprovado, cinco navegações mobile simuladas da entrada sem sessão |
| `npm run quality:maintenance` | Diagnóstico gerado, sem alterar sua condição não bloqueante |
| `git diff --check` | Aprovado |

A primeira execução web identificou dez expectativas antigas de apresentação, incluindo elementos recolhidos e o estado de consulta de um chat que agora permanece montado. As asserções de origem, bytes, autorização e geração única foram mantidas; a segunda execução completa passou. Depois dela, o carregamento do perfil e a reutilização do schema de origem foram verificados novamente nos oito testes específicos e no build final.

Os casos incluem seleção e remoção com falha de quota, consentimento externo, rascunho da conversa, reentrada, v0, concorrência, resultado incerto, cancelamento da espera de seleção, correções de sinais, exclusão do último projeto, reload e separação de outra conta. A revisão independente encontrou o falso sucesso na remoção sem gravação confirmada; a correção restaura a seleção e o caso de quota passou.

A visita manual usou o Next real com HTTP sintético e ativos de avaliação já existentes. Observou 384 × 384 px por imagem no desktop, 288 × 288 px em 320 px de viewport, gaps de 24/32 px, contador/CTA de 16 px e zero overflow horizontal em 320 px. O log registrou quatro seleções, uma criação de post e uma exclusão de projeto de teste, sem chamada de geração ou turno do modelo. Nenhum dado remoto foi excluído.

## Bundle e performance

Snapshots `references-focused-before` e `references-focused-final` foram obtidos por `next analyze --output --snapshot NOME` e exportados em JSON Lines comprimido. A atribuição por módulo passou de 350.856 a 355.864 bytes comprimidos, deduplicando partes por arquivo e origem. Isso não equivale ao gzip dos chunks nem a bytes transferidos.

A fronteira dinâmica já existente continua em `workspace.tsx → studio-app.tsx`. O perfil é importado diretamente pelo estúdio, preservando essa fronteira inicial. Uma fronteira dinâmica adicional do perfil aumentava o código retido no build; foi removida. O schema de pedido fica no adaptador HTTP, e o perfil reutiliza `pinOriginSchema` para validar a origem. Nenhum limite ou validador de dados foi enfraquecido.

O grafo emitido confirma `workspace.tsx → async studio-app.tsx → studio-profile.tsx → profile-contract.ts / profile-local.ts`. Os módulos `profile-store.ts`, `profile-route.ts`, `agent-auth.ts` e o handler `/api/profile` não aparecem como membros emitidos do cliente. Os schemas públicos e a projeção local permanecem no navegador; acesso ao banco e resolução da identidade ficam no servidor.

| Medida local inicial | Valor | Limite |
| --- | ---: | ---: |
| JavaScript inicial da entrada sem sessão | 0 bytes gzip | 250.000 |
| Todos os chunks JS | 299.969 bytes gzip | 300.000 |
| LCP, mediana de cinco execuções | 612,728 ms | 2.500 |
| TBT, mediana | 0 ms | 200 |
| CLS, mediana | 0 | 0,1 |

O total inicial deixou **31 bytes de margem local**. A primeira execução Linux excedeu o limite; o ajuste posterior está registrado abaixo. Não foi elevado o orçamento nem adicionada exceção. Lighthouse mede a entrada sem sessão, não o estúdio autenticado, latência da IA ou qualidade criativa. Não há alegação de ganho de velocidade.

## Ajuste após a primeira execução do PR 58

O [CI inicial](https://github.com/MathBorgess/compor/actions/runs/43904237477) mediu **300.554 bytes gzip** no commit `71c2d62`: 554 acima do limite, com build, checks estáticos e contratos aprovados. A diferença em relação ao macOS reforça a necessidade de medir o build Linux.

A correção consolida `PersonaStep`, `StudioDirection` e `StudioAssets` no módulo do estúdio. Esses três componentes tinham um único importador, `studio-app.tsx`, e suas dependências compartilhadas já eram alcançáveis pelo estúdio. O `dynamic` externo de `workspace.tsx → studio-app.tsx` permanece. Nenhuma condição de montagem, handler, validação, dependência ou orçamento foi alterado. `StudioAssets` conserva seus estados internos de consulta e recuperação; desaparece apenas a espera pelo download de seu chunk separado.

O build local ajustado mede **295.588 bytes gzip**, redução de **4.381 bytes**, com margem de **4.412 bytes**. Os componentes passam a chegar junto com o estúdio; isso não comprova ganho de latência inicial. A decisão usa o total real dos chunks comprimidos com `gzipSync`, igual ao avaliador, e não a soma atribuída do analyzer.

O baseline `references-focused-final` e o snapshot posterior `references-pr58-ci-bundle-after` cobrem o app inteiro. Para os três alvos, a análise usou os importadores diretos, verificou raízes/alternativas e preservou a fronteira assíncrona externa. Não havia outro importador nem efeito de módulo que acessasse rede/storage. Formulários, critérios e cliente HTTP são conteúdo intencional do navegador; não foi movido código de servidor. O relatório completo e os exports separados ficam em `quality-results/references-focused/bundle-ci-candidates.md` e `analyze-ci-bundle-after.jsonl.gz`.

A alteração passou novamente em lint, tipos, build, **30 testes de comportamento focados** (zero falhas/pulos) e no avaliador de performance completo, com cinco navegações. Os casos cobrem persona, critérios, configurações desktop/mobile, primeiro post, autorização, recuperação de imagem, concorrência e preservação de conversa. A comparação do analyzer deduplica outputs/partes e reduziu a atribuição comprimida de 355.864 para 354.304 bytes; esse valor é distinto dos 295.588 bytes do orçamento. A emissão posterior contém 14 outputs cliente, 12 com membership exato e dois de runtime/polyfill; não há output unsupported nem trigger ausente. Nenhum Server Action foi acrescentado e nenhum código de servidor entrou nos três componentes.

## Entrada nas referências a partir da revisão/exportação

A revisão do PR identificou um caminho que o teste anterior não exercitava: abrir Configurações → Referências enquanto a etapa era revisão/exportação fechava a janela, mas a galeria continuava fora da área renderizada. Dois testes Chromium reproduziram a falha, em 1440 e 390 px. A abertura de referências agora muda centralmente a etapa para o estúdio, mantendo o mesmo post e o alcance da seleção.

Os dois testes passaram após a correção. Cobrem revisão e exportação restaurada, preservação da URL/post, título, seleção e rascunho da conversa, além da ausência de geração implícita. Logs locais: `reference-stage-red.log` e `reference-stage-green.log`. A alteração não modifica o carregamento dos módulos ou os limites de performance; o CI mede novamente a revisão final.

## Integração da issue 51 já incorporada na main

O Quality aprovou `fc0249a` com 479 testes web e 296.276 bytes gzip em Linux. Durante essa execução, a `main` recebeu o PR 56 (`f0021dc`), criando conflitos no controlador de jornada e no agendamento da leitura de referências. A integração preserva essa extração: `createStudioJourneyController` executa criação, salvamento, seleção e retomada; a preparação direta do primeiro post usa seus métodos. O rollback de seleção com falha de quota permanece atômico e específico da interface.

O aviso de espera acompanha `scheduleSelectionReading`, inclusive disparo e cancelamento, mantendo os 5 segundos definidos no módulo compartilhado. Não há um segundo relógio. A integração também mantém a navegação desde revisão/exportação, o perfil, a exclusão lógica e a consolidação dos módulos do estúdio.

O build e a performance local da integração passaram com **296.354 bytes gzip**, margem de **3.646 bytes**. Passaram 18 testes do controlador, 60 testes dos avaliadores e 28 testes de navegador focados; o caso adicional de remoção com falha de quota também passou. Os casos verificam preparação, perfil/exclusão, revisão e exportação, v0, responsividade, concorrência, persistência lenta e cancelamento/visibilidade do timer. O snapshot `references-pr58-main-integrated` e seu export separado preservam a evidência do grafo após a integração. A comparação conserva 37 rotas, 11 raízes e 14 outputs cliente (12 exatos e dois runtime/polyfill), sem outputs unsupported ou triggers ausentes. A fronteira workspace → studio-app segue assíncrona, e os três componentes consolidados seguem síncronos. As novas fontes cliente são apenas o controlador, o relógio e o schema público de peça; adaptadores de perfil, identidade e banco seguem ausentes dos members e parts emitidos para o cliente. A atribuição comprimida passou de 354.304 para 355.701 bytes; novamente, não é o total gzip cobrado pelo gate. O gate Docker permanece opcional; nenhuma execução de containers foi necessária para esta mudança. O resultado do CI sobre a revisão integrada será registrado no PR.

## Proveniência e artefatos

Execução no Codex desktop, macOS/arm64, Node 24.16.0, Next 16.4.4, Chromium 157 e Lighthouse 13.6.0. A variante exata do modelo não foi exposta pelo ambiente. Base Git inicial `f04ee7baa4183b8f2b9bd8ef73983094a3deac66`, branch local `codex/references-focused-profile`; os relatórios de ferramentas indicam essa base, enquanto o código verificado inclui o diff local.

Política instalada `3b095b1e008e6bfd6af49351b12af544c3c295cc`. SHA-256 de `AGENTS.md`: `8c3b24688e08cb2478d35a12e914b29c51cc8c1fa4321be78f57e57e2e5c95e5`.

Logs e capturas ficam em `quality-results/references-focused/`; medições do build ficam em `quality-results/performance/`. Os snapshots exportados e `bundle-comparison-final.json` permitem inspecionar a atribuição. Logs e snapshots são locais e ignorados pelo Git. As quatro capturas sintéticas revisáveis estão versionadas em [evidence/references-focused-2026-11-16](evidence/references-focused-2026-11-16). Servidores e processos temporários usados nesta revisão foram encerrados; caches temporários próprios foram movidos para a Lixeira.

Experience First orientou o espaço dedicado às imagens. Model the Domain manteve separados fonte, superfície, escopo e estado da espera. Prove It Works exigiu a jornada real no navegador, controles negativos e reexecução após correções.

## Próximos passos e limites

- Confirmar o Quality em CI Linux sobre o ajuste de bundle abaixo antes de publicar. A validação inicial foi local; em 16/11/2026 Matheus autorizou abrir o PR, acompanhar o CI e reduzir o bundle se necessário, sem aumentar o limite. O merge do PR na `main` e a publicação em produção permanecem fora deste pedido.
- Validar a leitura do perfil com Auth/PostgREST reais num ambiente próprio. PGlite e HTTP simulado não comprovam isolamento entre contas reais.
- A consulta mostra 25 projetos por página e até 500 sinais de cada fonte. Os demais sinais continuam armazenados; paginação individual de sinais ainda não existe.
- Critérios locais não são sincronizados entre dispositivos. Excluir o projeto não limpa o IndexedDB; limpar o navegador continua sendo uma operação distinta.
- A exclusão lógica conserva as permissões anteriores do MCP e não oferece exclusão física ou restauração do projeto nesta entrega.
- O gate Docker da issue 51 permanece opcional e independente; esta mudança não altera workflows ou avaliadores desse spike.
