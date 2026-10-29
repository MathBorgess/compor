# Compor MCP — protótipo local

Protótipo para estudar o protocolo e as skills do Compor antes da integração com o produto. É independente da interface visual e **não é o backend da v0**. As ferramentas de referências podem consultar fontes externas quando autorizadas; as demais capacidades e seus limites estão descritos abaixo. O protótipo não comprova integração com o produto, implantação, autenticação ou isolamento de pessoas. É um protótipo local de uma pessoa, não um serviço autenticado para múltiplas pessoas.

## Phoenix: decisão e limites da expansão

As decisões de 29/10 estão em [SCRUM-57](https://compor-mathai.atlassian.net/browse/SCRUM-57), [SCRUM-58](https://compor-mathai.atlassian.net/browse/SCRUM-58) e no [ADR 0010](../../docs/adr/0010-motor-recomendacao-phoenix-e-mcp-dual.md). A arquitetura e o diagrama são uma proposta; o registro de testes de uma revisão anterior não demonstra sua implantação ou qualidade criativa. A conexão à busca curada deve preservar autorização para a busca externa, origem, atributos escolhidos, distinção entre dados reais e sintéticos e a opção de seguir sem referências.

A expansão requer sinais de edição, escolha, rejeição, reação e exportação por versão, incluindo comentários posteriores; a fala da pessoa e a interpretação do agente têm registros distintos. O perfil é aplicado no escopo escolhido e pode mudar automaticamente, inclusive em resposta ambígua a uma preferência confirmada. A pessoa deve receber aviso na conversa e poder desfazer, restaurando o valor anterior com uma correção registrada. Exposição, silêncio e download não são aprovação.

O resumo para Supabase é uma saída distinta do Markdown local identificável. Envio individual ao mantenedor requer autorização específica, contínua e revogável; após revogação novos envios param e o material já recebido permanece até decisão de descarte. Texto e imagem integrais exigem autorização separada. O compartilhamento do Markdown para estudo exige autorização com colaboradores e finalidade, acesso restrito e registro de leituras e compartilhamentos. Um arquivo local por si só não garante isolamento contra outras pessoas ou processos com acesso à máquina.

Personalização, avaliações, dados agregados e telemetria têm finalidades distintas. Avaliações exigem consentimento próprio. A primeira etapa considera a pessoa e sua conversa, deixando métricas do público para depois. São necessárias evidências próprias para afirmar funcionamento do Supabase, implantação, acesso seguro, qualidade criativa, treinamento ou ganhos de cache, latência e custo; promoção requer avaliação humana.

## O que está implementado

- `list_skills`: retorna os identificadores, descrições e a versão do catálogo.
- `load_skill`: carrega instruções de uma das quatro skills locais, por identificador e versão permitidos, com SHA-256 do conteúdo para identificar o texto usado em uma avaliação. A versão é um rótulo do protótipo, não um registro imutável de conteúdo.
- `prepare_word_cloud`: prepara dados sem persistência ou renderização; preserva frequência, sugestão e escolha **informadas pelo cliente**. O peso efetivo segue essa prioridade: escolha informada, sugestão informada, frequência informada; zero é válido e ausência fica `null`. O protótipo não verifica quem forneceu cada valor. Essa regra é experimental e não confirma preferências nem estabelece que as escalas são equivalentes.
- `prepare_moodboard`: prepara uma direção versionada com elementos, referências opacas, rótulos, prioridades, pistas visuais e restrições separadas. Não busca imagens, renderiza, gera nem persiste; origem informada é alegação do cliente, não confirmação de autoria. Formas e ícones são pistas de estilo. Aspectos ou restrições omitidos retornam `null`, distintos de listas explicitamente vazias. Conflitos detectados são apenas literais: ausência de aviso não prova que o quadro está consistente.
- `prepare_layered_creative`: organiza uma peça sintética em camadas de texto, imagem ou forma, com geometria, ordem e estilo opcional. Transporta `font_ref`, peso, entrelinha e alinhamento; avisa sobre fonte não resolvida e imagem sem ativo. Não cria ativos, resolve fontes nem verifica autoria ou acesso.
- `prepare_annotation_context`: liga notas por camada ou área a um snapshot fornecido pelo cliente; seleção por área devolve candidatas por interseção geométrica e distingue ausência, ambiguidade e candidata única. Escopo de memória `product` sempre exige confirmação verificada fora do protótipo. Versão, autoria e escopo não são verificados contra armazenamento real; não infere nem atualiza preferências.
- `compor://catalog/sources` (Resource): catálogo auditável das fontes externas permitidas para busca de referências visuais (`access_method`: `curated_board_http` ou `api_official`, `license_default`: `inspiration_only`).
- `search_curated_references`: executa busca leve metadata-only nas fontes ativas do catálogo mediante `consent_external_search: true`, sem navegador headless e sem baixar imagens em alta resolução em disco. Sanitiza títulos/descrições externas sob `untrusted_external_caption`, retorna `ImageContent` (miniaturas em memória) e metadados para o chat, sem gerar uma página HTML.
- `stage_approved_references`: processa aprovação seletiva por atributo (`typography`, `composition`, `color`, `photography`) ou `proceed_without_references: true`. Baixa temporariamente apenas as referências aprovadas em `/tmp/compor-refs/{session_id}/{ref_id}.webp`, valida Magic Bytes, remove 100% dos metadados EXIF/XMP/IPTC e converte para o contrato opaco do PR 9 com `license_scope: "inspiration_only"`.
- `compose_creative_direction`: cruza referências opacas aprovadas (isolando exclusivamente os `selected_attributes`), Identidade Visual soberana e formato do PR 10 (incluindo coesão e diversidade de layout para carrossel), gerando um `CreativeDirectionManifest` em estado `pending_user_review` sem acionar geração paga.
- `discover_visual_references` (Phoenix Decision Engine): expõe a descoberta e o ranqueamento de referências, com modos de resposta para clientes MCP. A revisão anterior usou candidatos sintéticos; consulte a saída e os testes da revisão atual para identificar a origem e o motor efetivamente usado. Uma configuração de cache não comprova acertos ou economia.
- O ranker alternativo `ranker_mode: "logprobs"` é experimental, requer cliente OpenAI configurado pelo host e `consent_model: true`, e avalia apenas metadados. Os rankers experimentais enviam para avaliação todos os candidatos recuperados, inclusive os rejeitados ou filtrados, que continuam impedidos de aparecer ou ser preparados; o envio de miniaturas no modo Decision exige autorização separada. Respostas com categorias ausentes ou massa inválida se abstêm; não há fallback silencioso nem promoção automática. A [calibração sintética e a medição pontual](../../docs/evals/2026-10-29-phoenix-calibracao/README.md) preservam resultados e limites: nesta amostra, o ranker de logprobs se absteve em cinco de seis candidatos.
- O modo experimental `ranker_mode: "decision_score"` usa a Decision API para avaliar cada candidato recuperado, desde que `consent_model` esteja ativo; `consent_reference_previews` autoriza separadamente o envio das miniaturas. O resultado informa itens avaliados, filtrados e não avaliados, modelo e uso reportado. Probabilidades dos níveis da rubrica não são logprobs de tokens nem preferências calibradas. Falhas não viram pontuação. O [ensaio](../../docs/evals/2026-10-29-phoenix-e2e/README.md) registra uma busca real com 9/9 pontuados e seus limites.
- O catálogo delimita fontes e boards. Um feed de conta mais amplo só pode ser consultado quando estiver explicitamente incluído no escopo da chamada; o board retornado é o **solicitado**, não uma prova de autoria, licença ou origem comprovada. Quando a busca não traz resultados, o protótipo informa a limitação e permite continuar sem referência.
- `record_visual_feedback` (Phoenix Decision Engine): registra sinais de interação para personalização experimental. Uma interação isolada não equivale a aprovação da peça nem demonstra preferência permanente; os limites de escopo e autorização exigem testes próprios.
- Ferramentas `phoenix_profile_*`: registram sinais, consentimentos e mudanças por versão e escopo, com desfazer e histórico em Markdown local. A identidade é vinculada pelo host; os testes simulam pessoas, sem comprovar autenticação real. No transporte stdio, o perfil e seu histórico são restaurados de um snapshot privado local; o Markdown é um espelho visível, não a fonte de restauração. Escritores concorrentes e locks residuais falham sem sobrescrever dados.
- Ao registrar sinal de peça local, informe `piece_id` e o `version_id` exato do snapshot. O host confere a peça e a versão para a identidade vinculada e verifica o consentimento antes da gravação. Sem `piece_id`, a versão é uma alegação externa não verificada: o MCP não descobre automaticamente que ela se refere a uma peça local.
- No transporte stdio, `creative_local_create_from_file`, `creative_local_create`, `creative_local_edit_text`, `creative_local_set_caption` e `creative_local_read` criam um SVG local com texto separado de uma base PNG e editam camadas ou legenda em novas versões. A legenda informa origem declarada (`person` ou `agent_proposal`); não é autoria verificada nem aprovação. Uma nova peça pode declarar `derived_from` com peça e versão anteriores da mesma identidade; a origem e seus hashes são verificados, sem inferir aprovação ou autoria. Se outra versão estiver corrompida, uma versão histórica íntegra pode ser recuperada com aviso de histórico parcial. A importação por caminho exige autorização de uso e aceita apenas arquivos diretos da pasta de imagens da conversa selecionada pelo host; sem `CODEX_THREAD_ID`, essa importação fica indisponível. O cliente precisa gerar uma base sem texto e suportar SVG; o MCP valida o cabeçalho do PNG, mas não o decodifica integralmente, não gera a imagem nem garante legibilidade ou edição de elementos incorporados à base. O armazenamento é privado, mas não autentica pessoas contra outro processo com acesso ao mesmo usuário do sistema.
- Resumo do mantenedor: pode ser preparado localmente com autorização por destinatário e finalidade. A porta opcional para Supabase exige configuração e verificação de minimização pelo host; não há configuração nem envio por padrão. A validação de valores livres, as políticas de acesso e a persistência real continuam pendentes.
- `stdio`: processo para um cliente MCP local que executa o servidor como subprocesso.
- `fetchInProcess` / `createStreamableHttpHandler`: adaptadores para consumir o MCP via Streamable HTTP (OpenAI Agents SDK). Seu URL `https://compor.invalid/mcp` é um identificador de teste em processo.

As skills são instruções revisáveis, não funções executáveis ou autorizações. O servidor retorna apenas instruções do catálogo fixo; texto de referências futuras é dado não confiável. O protótipo não implementa autenticação nem isolamento entre pessoas. Não o exponha na rede nem o use como serviço compartilhado.

## Preparação e testes

Requer Node.js 20 ou superior. Na pasta deste protótipo:

```sh
npm ci --ignore-scripts
npm test
```

## Usar no chat do Codex

Na raiz do repositório, execute `cd prototypes/compor-mcp && npm ci --ignore-scripts && npm run build`. A configuração de projeto `.codex/config.toml` aponta para o MCP stdio. Inicie ou recarregue uma sessão Codex no projeto confiável para descobrir o servidor `compor`; uma sessão já aberta pode precisar ser reiniciada. Peça no chat uma peça, uma busca de referências ou uma revisão. O Codex deve conduzir o fluxo na conversa, pedir autorização quando necessária, mostrar origens e permitir seguir sem referências.

O MCP prepara referências, direção e perfil. Quando solicitado, o cliente Codex pode usar sua própria ferramenta de geração de imagens para criar e mostrar uma peça; a disponibilidade dessa ferramenta depende do cliente. O MCP não gera imagens por conta própria. O classificador pode usar Luna, API configurada pelo host ou mock explícito; o resultado informa o motor e falhas não são convertidas silenciosamente em sucesso.

O stdio guarda o perfil da identidade local do host sob `~/.codex/compor-mcp/profile` (ou `COMPOR_PROFILE_DIR`), com diretório privado e arquivos restritos. Não é autenticação de produção. A aplicação impede sobrescrita por um processo com estado obsoleto; após uma falha é necessário recarregar e, se houver lock residual, investigar antes de removê-lo. O uso com Supabase é opcional e separado.

**Evidência pontual:** em 29/10/2026, uma execução do MCP buscou referências reais do Pinterest e usou Luna para roteamento e ordenação, sem gerar HTML. Os detalhes e limites estão no [registro da verificação](../../docs/evals/2026-10-29-phoenix-conversacional.md). Isso não demonstra autenticação, Supabase, qualidade criativa, treinamento, disponibilidade contínua, licença de reutilização ou ganhos de custo e cache.

Na verificação local desta mudança, 71 testes passaram. O teste isolado do app-server descobriu as 20 ferramentas e chamou o Phoenix sintético; ele não iniciou um turno de modelo.

Os testes compilam TypeScript e incluem os seguintes contratos históricos:

1. Negociação MCP em memória, descoberta de tools e carregamento das quatro skills, com `fetch` global bloqueado.
2. Recusa de versões/identificadores inexistentes e argumentos inválidos, sem divulgar caminhos locais, e erro para a tool inexistente `generate_image`.
3. Negociação MCP via `stdio` com um processo filho e comparação do catálogo. O SDK herda uma lista padrão de variáveis de ambiente do processo pai; o teste não prova ambiente inteiramente vazio.
4. `MCPServerStreamableHttp` do Agents SDK negocia MCP, lista tools e chama `load_skill` pelo adaptador de `fetch` em processo, com tracing desativado e chamadas ao `fetch` global bloqueadas.
5. A preparação da nuvem preserva as fontes, a prioridade, o peso zero e os valores ausentes.
6. Entradas inválidas ou fora dos limites são recusadas pela tool de preparação.
7. O moodboard preserva direção, papéis, prioridades, restrições e origem não verificada.
8. Conflitos literais recebem avisos, sem que uma prioridade anule restrições.
9. Referências, IDs, elementos e geometria inválidos são recusados.
10. Textos maliciosos são tratados como dados na tool e nenhuma referência é buscada via `fetch` no cenário de teste.
11. Elementos com instruções literalmente opostas e pistas sem valor recebem avisos sem alterar o quadro.
12. Aspectos e restrições omitidos são distinguidos de listas explicitamente vazias.
13. Camadas, anotações por área e por camada, alvos inválidos e lote de críticas sintéticas são verificados pelo MCP, sem gravar memória ou buscar ativos.

14. Caixa de moodboard fora do quadro, rotação não verificada, pesos acima do teto técnico, ausência de ativo, estado da seleção e confirmação de escopo produto.
15. Campos tipográficos preservados sem defaults; referências de fonte opacas, valores inválidos e snapshots antigos sem novos campos.
16. Governança do catálogo `compor://catalog/sources`, bloqueio sem consentimento ou para fontes fora do catálogo/inativas, sanitização textual (`untrusted_external_caption`) e binária (Magic Bytes + remoção 100% de EXIF/XMP/IPTC), zero download na busca vs. staging seletivo na aprovação, fallback sem referências e preservação de linhagem `inspiration_only`.

**Resultado observado em 28/10/2026:** 25 testes passaram em Node.js v24.16.0 ([verificação](../../docs/evals/2026-10-28-harness/verification.txt)). A suíte verifica contratos; não exercita uma chamada de modelo, a Vercel, o app, autenticação ou dados reais. O bloqueio de `fetch` nos testes exercitados não prova ausência geral de toda comunicação de rede ou segurança de isolamento. Os experimentos com modelo e imagens têm registros separados abaixo.

## Teste nativo do Codex app-server

Em macOS ou outro sistema POSIX, com Codex CLI e Python 3 no `PATH`, execute após o build:

```sh
python3 scripts/test-codex-app-server.py
```

O script cria um diretório temporário exclusivo para o cliente Codex, sem copiar configurações ou autenticação existentes. Usa um ambiente explícito sem credenciais, um único servidor MCP `stdio` e um provedor fictício com endereço local. Envia `initialize`, consulta `mcpServerStatus/list`, cria uma thread efêmera e chama ferramentas do catálogo e o Phoenix por `mcpServer/tool/call`; não envia `turn/start` nem solicita modelo. O JSON de saída informa os resultados e verifica o SHA-256 das instruções retornadas por `load_skill`. Ao encerrar, o script aguarda o app-server e solicita o encerramento apenas do grupo de processos que criou.

**Resultado observado em 27/10/2026:** Codex CLI `0.162.1` descobriu `list_skills`, `load_skill`, `prepare_word_cloud`, `prepare_moodboard`, `prepare_layered_creative` e `prepare_annotation_context`, listou os quatro IDs na versão `0.1.0-prototype`, confirmou o hash de uma skill, rejeitou ID inexistente e verificou quadro e pesos sintéticos. Isso verifica o cliente app-server via `stdio`, não que um modelo usou a skill, o transporte em processo do aplicativo ou isolamento de usuários reais.

## Conectar um harness local via stdio

Após `npm ci --ignore-scripts` e `npm run build`, configure o cliente MCP para iniciar o executável Node local com o caminho absoluto para `dist/stdio.js`. Exemplo de configuração genérica; os campos exatos dependem do harness:

```json
{
  "command": "node",
  "args": ["/CAMINHO/ABSOLUTO/compor/prototypes/compor-mcp/dist/stdio.js"]
}
```

A configuração não faz parte do teste automatizado e não instala nem altera um harness. O processo deve ter acesso de leitura à pasta `skills/` do mesmo protótipo. O cliente deve encerrar o subprocesso ao fechar a conexão. Nunca acrescente credenciais aos argumentos do comando ou ao retorno das tools.

## Experimentos de trajetória e imagens — 28/10/2026

O [registro das ondas](../../docs/evals/2026-10-28-harness/README.md) compara H0/H1 operando as tools reais por um [bridge local](evals/BRIDGE.md), com briefing fictício, imagens geradas no ambiente e composição de texto separada. H2–H4 testam refinamento da imagem, copy e direção de arte; M1/A1 exercitam escopo da memória e crítica por aspecto. Entradas, erros, hashes, planos, imagens e julgamentos foram preservados. Não é integração de geração do MCP nem execução BYOK do produto; os Judges são personas simuladas.

As correções de contrato têm [antes/depois](evals/contracts/README.md), e a skill [refinar-criativo](evals/candidates/refinar-criativo.md) continua candidata fora do catálogo. O [inventário de trajetórias](../../docs/evals/2026-10-28-trajetorias-mcp.md) distingue observação parcial de capacidade ausente. A [nova verificação do app-server](../../docs/evals/2026-10-28-harness/verification-smoke.json) novamente chamou as seis tools sem iniciar turno de modelo.

## Próximas verificações

- Repetir as sessões de modelo em casos reservados e com mais de uma execução; as sessões sintéticas observadas não são uso humano, teste estatístico ou prova de generalização.
- Projetar identidade, escopo, autorização por operação, proteção de BYOK, consentimento e isolamento antes de qualquer dado de usuário ou endpoint acessível.
- Validar o ciclo de vida, cancelamento, concorrência e desempenho com Next.js/Vercel e versões fixadas. `fetchInProcess` é somente para teste, não é uma decisão sobre o adaptador de produção.
- Definir e implementar as ferramentas de memória, referências, feedback e geração com seus testes; não expor operações que o protótipo não executa.
- Comparar a qualidade das trajetórias e das saídas com avaliações humanas e casos reservados; os testes atuais verificam protocolo, catálogo e preparação de dados, não valor criativo.

## Spike de composição por camadas

O [experimento sintético](spike-layers/README.md) consome snapshots obtidos via MCP em memória e usa um renderer Pillow separado para criar duas prévias. A mudança de tamanho do preço é predeterminada; o ensaio não comprova interpretação de crítica, geração por IA, memória, interface ou isolamento de usuários.
