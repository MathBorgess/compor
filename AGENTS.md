# Compor: contrato de desenvolvimento

Estas instruções foram solicitadas por Matheus em 05/11/2026 para orientar alterações neste repositório. Descrevem a arquitetura do código e as regras de contribuição. Não concedem acesso a dados, autorização de geração, deploy ou publicação.

## Leia antes de alterar

Comece pelo [mapa atual da arquitetura](docs/architecture.md), pelo [índice de ADRs](docs/adr/README.md) e pelos [gates de qualidade](docs/quality/gates.md). Leia o contrato e os testes da camada afetada. Documentos datados preservam decisões anteriores; não trate uma proposta histórica como descrição do código atual.

**Bundle do Turbopack.** Ao acrescentar uma dependência de cliente ou mover código para o navegador, rode `next analyze` antes e depois e otimize conforme o [guia de package bundling](https://nextjs.org/docs/app/guides/package-bundling) e o [ADR 0033](docs/adr/0033-turbopack-e-analise-do-bundle.md). Para o bundle, use a skill `next-bundle-optimizer` (`.claude/skills/` ou `.agents/skills/`); as outras skills do Next, sua origem e restrições estão em [vercel-next-skills](docs/third-party/vercel-next-skills.md). O codemod `agents-md`, upgrades do Next e ligar `cacheComponents` ou `partialPrefetching` são decisões de Matheus.

O app usa **OpenAI Agents API gerenciada**. O Agents SDK aparece no protótipo e em experimentos; não é o runtime do estúdio web. O MCP remoto e o protótipo stdio têm identidades e capacidades distintas.

## Onde colocar cada mudança

| Área | Responsabilidade |
| --- | --- |
| `apps/web/app` | Componentes TSX, páginas, handlers HTTP TS e composição das dependências do Next |
| `apps/web/lib` | Domínio, schemas, persistência local e adaptadores de servidor do app, em TS |
| `apps/site` | Site público Astro estático, separado da sessão privada |
| `packages/agents-api` | Sessões/turnos gerenciados, contratos de ferramentas, consentimento, reservas e recuperação |
| `packages/images-api` | Chamada pontual ao provedor de imagens e validação do resultado |
| `packages/private-images` | Acesso privado, armazenamento e listagem de imagens |
| `packages/remote-mcp` | Transporte remoto autenticado e delegação limitada ao projeto |
| `packages/agile-deliberation` | Metodologia compartilhada, árvore de critérios e propostas puras |
| `packages/attempt-metrics` | Medição e representação de uso conhecido ou desconhecido |
| `prototypes/compor-mcp` | Servidor stdio local e experimentos; não publicar como backend multiusuário |
| `supabase/migrations`, `supabase/tests` | Evolução do banco, RLS e evidências de isolamento |
| `scripts/quality`, `.github/workflows` | Avaliadores e execução dos gates |
| `third_party` | Fontes externas preservadas, licença, origem e hashes |

## Regras de implementação

- Código de produção do Next em `app` e `lib` usa `.ts` ou `.tsx`, com `strict: true`. Não introduza `any` explícito, supressões TypeScript ou opções para ignorar erro no build.
- Valide dados recebidos de HTTP, storage, ferramentas e fornecedores em runtime. Uma declaração `.d.ts` não valida JSON nem prova a implementação de um pacote JavaScript. Atualize o contrato, suas declarações e seus testes juntos.
- Componentes de cliente não importam configuração ou adaptadores exclusivos do servidor. Pacotes compartilhados não importam componentes de `apps/web`. Use os exports dos pacotes; mantenha segredos fora do grafo do cliente.
- A sessão autenticada define a identidade. Verifique acesso por operação e preserve RLS. IDs, argumentos do modelo, declarações de consentimento ou resultados enviados pelo navegador não substituem essa verificação.
- BYOK permanece em memória da sessão. Não grave chaves em storage, cookies, URLs, logs, contexto do modelo ou argumentos de ferramentas. Telemetria operacional admite somente os metadados previstos no contrato.
- Por decisão de Matheus em 10/11/2026, a aplicação web pode usar a padrão do Supabase Vault sem BYOK. A resolução de operações de projeto é exclusiva do servidor, após origem, identidade e propriedade verificadas. O status global exige origem/identidade e retorna só disponibilidade, sem chamar OpenAI. Credencial administrativa fica restrita à RPC fixa; demais dados mantêm token da pessoa e RLS. BYOK presente, mesmo inválida, nunca aciona fallback. Disponibilidade, abertura e recarga não autorizam geração pela padrão: ela exige intenção explícita para o projeto; BYOK conectada explicitamente mantém autorização histórica por sessão. Troca pausa solicitações e não reutiliza provas/sessões da anterior nem libera resultado incerto. MCP externo mantém contrato próprio. Ver [ADR 0038](docs/adr/0038-chave-padrao-openai-no-vault.md).
- A arte inclui seus textos. Não reintroduza títulos, preços ou datas sobrepostos na prévia ou no PNG exportado. A legenda permanece separada. Edições criam versões e preservam a origem.
- Por decisão de Matheus em 06/11/2026, conectar a chave autoriza a geração guiada durante a sessão, sem confirmação de cada operação. Na validação posterior do mesmo dia, ele substituiu a exploração contínua sem intervalos por lotes de três imagens, seguidos de uma espera visível de 15 segundos antes do lote seguinte. Após duas rodadas completas sem seleção ou comentário, aguarde um pedido explícito para gerar mais. Depois da pergunta do turno de seleção de referências, nenhum lote começa até a pessoa responder, selecionar ou comentar uma imagem, ou pedir mais propostas ([ADR 0029](docs/adr/0029-agente-opinativo-e-pergunta-unica.md)). Por decisão de Matheus em 09/11/2026, a ideia inicial do projeto basta para o primeiro lote com a chave conectada; não exige oferta ou direção preenchidas ([ADR 0037](docs/adr/0037-referencias-sugeridas-e-retorno-ao-post.md)). Um conflito entre públicos antigos ainda pausa a exploração até a escolha explícita. A geração é sequencial e para ao sair da tela de referências, desconectar a chave, encerrar a sessão ou diante de resultado desconhecido. Preserve o vínculo entre prompt, textos, origem, bytes das imagens e autorização; resultado desconhecido não autoriza repetição automática. Esta decisão substitui a exigência anterior de confirmação da operação concreta.
- A busca externa de referências depende de consentimento uma vez por sessão da conta. Sem consentimento, consulte apenas metadados do histórico próprio e não carregue prévias externas. Sugestões não entram no contexto do modelo antes da escolha da pessoa. O editor permite voltar às referências e retornar ao post preservando rascunho, imagem, versões e conversa; a exploração continua restrita à tela de referências ([ADR 0037](docs/adr/0037-referencias-sugeridas-e-retorno-ao-post.md)).
- Critérios distinguem criador/destinatário e visual/mensagem. Use exemplos e contraexemplos apenas para ambiguidades relevantes. Um fato da oferta declarado pela pessoa, como preço, data, condição ou característica, é ordem. O agente não o altera nem o inventa, e afirmações contidas em opções sugeridas continuam `sugerido` até a pessoa declará-las. Uma sugestão de gosto, por fala ou seleção, é ponderada. O agente toma posição, pode contestar a mesma sugestão uma vez e a segue se a pessoa insistir. O agente propõe; o criador aceita, rejeita ou reabre e tem a palavra final. Persona simulada continua hipótese.
- Fontes copiadas em `third_party` permanecem íntegras. Portes e adaptações ficam nos pacotes, com atribuição e mapa de incorporação. Atualizar origem exige atualizar licença/proveniência e testes.
- Ao mudar limites entre camadas, persistência, autoridade ou contrato externo, atualize o guia atual e adicione um ADR. Preserve o histórico e diga exatamente qual decisão foi substituída.
- Por decisão de Matheus em 10/11/2026, o workflow do Supabase cria e ativa a produção Vercel após sucesso confirmado de `migrate`, no mesmo commit. Bootstrap e falhas não publicam. A ativação atualiza os aliases; os testes reais ficam como validação humana posterior. Credenciais, proteções remotas e confirmação do resultado continuam necessárias; não há rollback automático do banco. Ver [ADR 0039](docs/adr/0039-publicacao-vercel-apos-migrations.md).

## O que os gates cobram

O workflow [Quality](.github/workflows/quality.yml) agrega os jobs no check **Quality gate**. Num PR, ele executa só as [áreas que a mudança pode afetar](docs/quality/gates.md#execução-por-área) e aceita um job pulado só quando a área dele não mudou. Por decisão de Matheus em 10/11/2026, o push na `main` não repete o Quality; a execução manual continua disponível e executa tudo. Execute os checks correspondentes antes de concluir a alteração; a sequência de instalação está no [guia atual](docs/architecture.md#instalação-e-verificação).

| Regra cobrada automaticamente | Comando |
| --- | --- |
| Correção ESLint, imports sem uso, ausência de `any`/supressões e ausência de JS de produção no Next | `npm run quality:lint` |
| Tipos estritos do app Next | `npm run quality:typecheck` |
| Contratos dos pacotes, protótipo, migrações e scripts | `npm run quality:unit` |
| Comportamento web com Chromium obrigatório | `npm run quality:browser` |
| Build de produção Next | `npm run quality:build` |
| Verificação e build do site estático | `npm run check --prefix apps/site` e `npm run build --prefix apps/site` |
| Avaliador dos orçamentos e medição de produção | `npm run quality:test` e `npm run quality:performance` |

Complexidade acima de 20 gera diagnóstico em `quality:maintenance`; não bloqueia por si só. O grafo de imports entre camadas, a qualidade visual, o significado das decisões humanas e a cobertura suficiente dos testes ainda exigem revisão. Não descreva essas regras como se um lint arquitetural já existisse.

Testes usam serviços simulados e não autorizam chamadas pagas. Lighthouse mede a entrada sem sessão, não o custo ou a latência da geração. Uma execução local aprovada não comprova CI Linux, deploy, isolamento entre contas reais ou qualidade criativa. Registre essas evidências separadamente.

Exigir **Quality gate** na proteção da branch é uma configuração do GitHub; o YAML não a ativa. Não remova checks, reduza orçamentos ou acrescente exceções apenas para obter aprovação. Explique a necessidade e mantenha a mudança revisável.
