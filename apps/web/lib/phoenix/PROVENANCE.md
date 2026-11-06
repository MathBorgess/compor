# Phoenix determinístico no estúdio web

Adaptação do código próprio de `prototypes/compor-mcp/src/phoenix_engine`, no commit `1384a88390901eb3cf773a04f2268e174634f0de` (PR #17). `source-manifest.json` registra SHA-256 dos arquivos de origem. Não é um porte do Agile Deliberation do Google; essa origem e licença continuam em `third_party/google-research/agile_deliberation` e `packages/agile-deliberation`.

| Arquivo web | Origem e adaptação |
| --- | --- |
| `catalog.ts` | Vocabulário de boards, papéis e SIDs de `domain/catalog.ts`; comentário esclarece que este runtime não verifica fontes externas. |
| `models.ts` | Apenas contratos de alocação, roteamento, score, perfil e afinidade de `domain/models.ts`. |
| `hyperparams.ts` | Defaults e validação de `config/hyperparams.ts`; leitor de ambiente removido. |
| `formulas.ts` | Fórmulas puras de `math/formulas.ts`; imports locais. |
| `deterministic.ts` | Embedding SHA-256, destilação, consultas sintéticas, cota de exploração e os dois métodos determinísticos de `services/decision_api.ts`, convertidos em funções. Sem classe de serviço, cliente OpenAI, Codex CLI ou imports de servidores. |

`../phoenix-worker.ts` mantém o nome do módulo do PR por rastreabilidade, mas é uma fachada chamada diretamente: não há worker nem subprocesso. Seu schema limita IDs, briefing e título; usa defaults fixos, sem personalização inferida da conta nem identidade visual do Compor imposta à arte. Os slugs de catálogo são sugestões de pesquisa. Não há busca, download, staging de imagens, memória de gosto, dados de audiência ou geração. Scores são heurísticas sintéticas, não probabilidades empiricamente calibradas de preferência ou conversão.

O benchmark sintético continua nos experimentos do protótipo; não roda em cada requisição web. A geração integral e os consentimentos permanecem na rota de imagem do estúdio. Não são carregados os exports de `server.ts`, skills do filesystem, `dist` nem scripts de calibração.

Mudanças na origem não entram automaticamente: revisar diferenças, atualizar o manifesto e os testes de paridade antes de portar outra versão. Isso preserva os hashes e reproduções históricas do protótipo. O teste web também executa o bundle em diretório temporário externo ao checkout; o staging exige os arquivos de runtime e esta proveniência. Ver [ADR 0019](../../../../../docs/adr/0019-phoenix-deterministico-no-bundle-web.md).
