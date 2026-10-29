# Compor MCP — protótipo local

Protótipo para estudar o protocolo e as quatro skills do Compor antes da integração com o produto. É independente da interface visual e **não é o backend da v0**. O servidor processa as entradas recebidas em memória, mas não consulta dados armazenados, Supabase, imagens, BYOK ou APIs externas e não fornece persistência, geração de imagens, renderização no produto, edição ou exportação. Use apenas entradas fictícias neste protótipo.

## O que está implementado

- `list_skills`: retorna os identificadores, descrições e a versão do catálogo.
- `load_skill`: carrega instruções de uma das quatro skills locais, por identificador e versão permitidos, com SHA-256 do conteúdo para identificar o texto usado em uma avaliação. A versão é um rótulo do protótipo, não um registro imutável de conteúdo.
- `prepare_word_cloud`: prepara dados sem persistência ou renderização; preserva frequência, sugestão e escolha **informadas pelo cliente**. O peso efetivo segue essa prioridade: escolha informada, sugestão informada, frequência informada; zero é válido e ausência fica `null`. O protótipo não verifica quem forneceu cada valor. Essa regra é experimental e não confirma preferências nem estabelece que as escalas são equivalentes.
- `prepare_moodboard`: prepara uma direção versionada com elementos, referências opacas, rótulos, prioridades, pistas visuais e restrições separadas. Não busca imagens, renderiza, gera nem persiste; origem informada é alegação do cliente, não confirmação de autoria. Formas e ícones são pistas de estilo. Aspectos ou restrições omitidos retornam `null`, distintos de listas explicitamente vazias. Conflitos detectados são apenas literais: ausência de aviso não prova que o quadro está consistente.
- `prepare_layered_creative`: organiza uma peça sintética em camadas de texto, imagem ou forma, com geometria, ordem e estilo opcional. Transporta `font_ref`, peso, entrelinha e alinhamento; avisa sobre fonte não resolvida e imagem sem ativo. Não cria ativos, resolve fontes nem verifica autoria ou acesso.
- `prepare_annotation_context`: liga notas por camada ou área a um snapshot fornecido pelo cliente; seleção por área devolve candidatas por interseção geométrica e distingue ausência, ambiguidade e candidata única. Escopo de memória `product` sempre exige confirmação verificada fora do protótipo. Versão, autoria e escopo não são verificados contra armazenamento real; não infere nem atualiza preferências.
- `compor://catalog/sources` (Resource): catálogo auditável das fontes externas permitidas para busca de referências visuais (`access_method`: `curated_board_http` ou `api_official`, `license_default`: `inspiration_only`).
- `search_curated_references`: executa busca leve metadata-only nas fontes ativas do catálogo mediante `consent_external_search: true`, sem navegador headless e sem baixar imagens em alta resolução em disco. Sanitiza títulos/descrições externas sob `untrusted_external_caption`, retorna `ImageContent` (thumbnails 236x em memória) e gera `/tmp/compor-refs/{session_id}/board.html`.
- `stage_approved_references`: processa aprovação seletiva por atributo (`typography`, `composition`, `color`, `photography`) ou `proceed_without_references: true`. Baixa temporariamente apenas as referências aprovadas em `/tmp/compor-refs/{session_id}/{ref_id}.webp`, valida Magic Bytes, remove 100% dos metadados EXIF/XMP/IPTC e converte para o contrato opaco do PR 9 com `license_scope: "inspiration_only"`.
- `compose_creative_direction`: cruza referências opacas aprovadas (isolando exclusivamente os `selected_attributes`), Identidade Visual soberana e formato do PR 10 (incluindo coesão e diversidade de layout para carrossel), gerando um `CreativeDirectionManifest` em estado `pending_user_review` sem acionar geração paga.
- `discover_visual_references` (Phoenix Decision Engine): executa o Estágio 1 (Decision Router composicional + fusão vetorial da User Tower com Rocchio/EMA) e o Estágio 2 (Candidate-Isolated Parallel Ranker com prefixo KV-Cache estático + Weighted Scorer multi-ação + decaimento de diversidade por prefixo de Semantic ID), adaptando a saída para `client_mode="codex"` (Markdown enxuto sem URLs de rastreio) ou `client_mode="web"` (JSON estruturado completo). Quando `OPENAI_API_KEY` não está configurada no modo Codex, delega ao subagente `gpt-6-luna` ou solicita a chave; em testes, utiliza motor determinístico local.
- `record_visual_feedback` (Phoenix Decision Engine): registra eventos de interação na sessão (`locked_as_reference`, `expand_zoom`, `discard_generic`, `style_mismatch`), atualiza os vetores da sessão (`pos_session_vecs` / `neg_session_vecs`), os contadores Beta-Bernoulli de afinidade por board e dispara a consolidação assíncrona de memória de longo prazo (`user_taste_json`).
- `stdio`: processo para um cliente MCP local que executa o servidor como subprocesso.
- `fetchInProcess` / `createStreamableHttpHandler`: adaptadores para consumir o MCP via Streamable HTTP (OpenAI Agents SDK). Seu URL `https://compor.invalid/mcp` é um identificador de teste em processo.

As skills são instruções revisáveis, não funções executáveis ou autorizações. O servidor retorna apenas instruções do catálogo fixo; texto de referências futuras é dado não confiável. O MVP não implementa autorização, autenticação ou isolamento entre pessoas. **Não exponha este protótipo na rede e não o use com dados reais.**

## Preparação e testes

Requer Node.js 20 ou superior. Na pasta deste protótipo:

```sh
npm ci --ignore-scripts
npm test
```

O teste compila TypeScript e executa 25 cenários automatizados, incluindo os seguintes:

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

O script cria um diretório temporário exclusivo para o cliente Codex, sem copiar configurações ou autenticação existentes. Usa um ambiente explícito sem credenciais, um único servidor MCP `stdio` e um provedor fictício com endereço local. Envia `initialize`, consulta `mcpServerStatus/list`, cria uma thread efêmera e chama as seis tools por `mcpServer/tool/call`; não envia `turn/start` nem solicita modelo. O JSON de saída informa os resultados e verifica o SHA-256 das instruções retornadas por `load_skill`. Ao encerrar, o script aguarda o app-server e solicita o encerramento apenas do grupo de processos que criou.

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
