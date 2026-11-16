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

| Medida final | Valor | Limite |
| --- | ---: | ---: |
| JavaScript inicial da entrada sem sessão | 0 bytes gzip | 250.000 |
| Todos os chunks JS | 299.969 bytes gzip | 300.000 |
| LCP, mediana de cinco execuções | 612,728 ms | 2.500 |
| TBT, mediana | 0 ms | 200 |
| CLS, mediana | 0 | 0,1 |

O total deixa **31 bytes de margem local**. A medição Linux precisa ser confirmada antes de publicação; mudanças futuras podem ultrapassar o limite. Não foi elevado o orçamento nem adicionada exceção. Lighthouse mede a entrada sem sessão, não o estúdio autenticado, latência da IA ou qualidade criativa. Não há alegação de ganho de velocidade.

## Proveniência e artefatos

Execução no Codex desktop, macOS/arm64, Node 24.16.0, Next 16.4.4, Chromium 157 e Lighthouse 13.6.0. A variante exata do modelo não foi exposta pelo ambiente. Base Git `f04ee7baa4183b8f2b9bd8ef73983094a3deac66`, branch local `codex/references-focused-profile`; os relatórios de ferramentas indicam essa base, enquanto o código verificado inclui o diff local.

Política instalada `3b095b1e008e6bfd6af49351b12af544c3c295cc`. SHA-256 de `AGENTS.md`: `8c3b24688e08cb2478d35a12e914b29c51cc8c1fa4321be78f57e57e2e5c95e5`.

Logs e capturas ficam em `quality-results/references-focused/`; medições do build ficam em `quality-results/performance/`. Os snapshots exportados e `bundle-comparison-final.json` permitem inspecionar a atribuição. Logs e snapshots são locais e ignorados pelo Git. As quatro capturas sintéticas revisáveis estão versionadas em [evidence/references-focused-2026-11-16](evidence/references-focused-2026-11-16). Servidores e processos temporários usados nesta revisão foram encerrados; caches temporários próprios foram movidos para a Lixeira.

Experience First orientou o espaço dedicado às imagens. Model the Domain manteve separados fonte, superfície, escopo e estado da espera. Prove It Works exigiu a jornada real no navegador, controles negativos e reexecução após correções.

## Próximos passos e limites

- Confirmar o Quality em CI Linux e sua margem de bundle antes de publicar. A validação inicial foi local; em 16/11/2026 Matheus autorizou abrir o PR, acompanhar o CI e reduzir o bundle se necessário, sem aumentar o limite. Merge e publicação em produção permanecem fora deste pedido.
- Validar a leitura do perfil com Auth/PostgREST reais num ambiente próprio. PGlite e HTTP simulado não comprovam isolamento entre contas reais.
- A consulta mostra 25 projetos por página e até 500 sinais de cada fonte. Os demais sinais continuam armazenados; paginação individual de sinais ainda não existe.
- Critérios locais não são sincronizados entre dispositivos. Excluir o projeto não limpa o IndexedDB; limpar o navegador continua sendo uma operação distinta.
- A exclusão lógica conserva as permissões anteriores do MCP e não oferece exclusão física ou restauração do projeto nesta entrega.
- O gate Docker da issue 51 permanece opcional e independente; esta mudança não altera workflows ou avaliadores desse spike.
