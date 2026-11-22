# Curadoria de skills criativas e copy na imagem

**Versão do catálogo:** `compor-creative-skills.v1`  
**Implementação:** [`packages/agents-api/src/creative-skills/`](../packages/agents-api/src/creative-skills/index.mjs)  
**ADR associado:** [ADR 0080](adr/0080-skills-criativas-copy-e-modos-de-post.md)

Este documento consolida a curadoria de referências internas e externas incorporadas ao agente do Compor (chat gerenciado e planejador de exploração) para criação de posts e criativos de alto desempenho no Instagram e princípios compatíveis com TikTok, além da skill dedicada de `copy-na-imagem`.

## Arquitetura em duas camadas

O runtime do Compor na OpenAI Agents API opera com `environment: { type: 'none' }` (sem leitura de filesystem em execução). Por isso, a curadoria é organizada em módulos versionados e imutáveis em `packages/agents-api/src/creative-skills/`, resolvidos dinamicamente via `resolveCreativeSkillBundle({ format, surface })`:

| Camada | ID da skill | Quando carrega | Superfícies | Papel principal |
| --- | --- | --- | --- | --- |
| Camada 1 (Base) | `creative-core.v1` | Sempre ativa | `chat`, `planner` | Legibilidade no feed a 360 px (*Squint Test*), diversidade real de ganchos/ângulos, integridade factual e legenda complementar separada. |
| Camada 2A (Copy) | `on-image-copy.v1` | Sempre ativa | `chat`, `planner` | Adequação ao perfil (`brandVoice`), calibração de consciência (Eugene Schwartz), ganchos de direct response, micro-copy de carrossel (*Slippery Slide*) e lista anti-clichês de IA em PT-BR. |
| Camada 2B (Formato) | `post-feed-estatico.v1` | `format === 'single'` | `chat`, `planner` | Post único 4:5 (`1024x1280`): foco único, respiro 40–50%, zona segura para grade 3:4 do perfil. |
| Camada 2B (Formato) | `carrossel-narrativo.v1` | `format === 'carousel'` | `chat`, `planner` | Carrossel 4:5 (`1024x1280`, 3–10 lâminas): arco narrativo, fluxo `Plano → Capa Âncora → Lâminas 2..N` e `visualInvariants`. |
| Camada 2B (Formato) | `colecao-editorial.v1` | `format === 'collection'` | `chat`, `planner` | Coleção de 2–10 fotos 4:5 (`1024x1280`): unidade fotográfica sem texto nas fotos internas, cadência de planos (abertura, detalhe, cena/uso). |
| Camada 2B (Formato) | `story-vertical.v1` | `format === 'story'` | `chat`, `planner` | Story 9:16 (`864x1536`): zonas seguras 15% topo / 25% base / 16% lateral direita, respiro para figurinhas nativas e proibição de botões falsos. |

## Origem e proveniência da curadoria

Nenhum arquivo de terceiros foi copiado literalmente para o código-fonte de produção. Os princípios abaixo foram sintetizados, adaptados ao português brasileiro e alinhados às regras de fidelidade factual e autoridade humana do Compor:

| Fonte / Referência | Contribuição curada | Onde foi incorporada |
| --- | --- | --- |
| `prototypes/compor-mcp/evals/candidates/carrossel-instagram/SKILL.md` (acervo interno) | Anatomia de carrossel de 3–10 lâminas, Lâmina 1 âncora visual, `visualInvariants`, coesão visual entre slides e regra de uma ideia por lâmina. | `carrossel-narrativo.v1`, fluxo `Plano → Capa Âncora → 2..N` |
| `prototypes/compor-mcp/evals/candidates/art-direction-h4.md` e `direcao-de-campanha.md` (acervo interno) | Direção de arte editorial, restrição de ornamentos que competem com a tipografia, coerência de cena e controle de variação. | `creative-core.v1`, `colecao-editorial.v1`, `post-feed-estatico.v1` |
| `social-post-director` (workflow local de Matheus: `post-formats.md`, `post-hooks.md`, `moodboard-and-layout.md`, `post-inspection.md`) | Taxonomia de ganchos de primeira dobra (*First-Fold Hook*), *Concept Grounding* (1 ideia por lâmina), *Competitor Swap Test*, proibição de clichês de IA e inspeção por contagem. | `on-image-copy.v1`, `carrossel-narrativo.v1`, `rubrica-estendida.md` |
| `brand-campaign-shots` e `poster-design` (workflows locais) | Cadência editorial de coleção fotográfica (plano aberto, detalhe tátil, cena de uso), iluminação consistente e hierarquia visual de pôster. | `colecao-editorial.v1`, `post-feed-estatico.v1` |
| `coreyhaines31/marketingskills` (`social-content`, `carousel-frameworks.md`, `copywriting`, `copy-editing`) | Estruturas de carrossel (Dor → Mecanismo → Prova → Ação), economia de palavras, direct response e revisão cirúrgica de copy antes da produção visual. | `on-image-copy.v1`, `carrossel-narrativo.v1`, ação "Refinar copy com IA" |
| Eugene Schwartz (*Breakthrough Advertising*) e Joseph Sugarman (*The Adweek Copywriting Handbook*) | 5 níveis de consciência para calibrar o gancho inicial; *Slippery Slide* (transições curtas e *open loops* que puxam o arraste entre lâminas). | `on-image-copy.v1` |
| Meta Andromeda / práticas de performance 2025–2026 e especificações Instagram/TikTok | Diversidade real de ângulos criativos (não apenas troca de cor), *Squint Test* a 360 px, proporções 4:5 (feed + recorte 3:4 na grade) e zonas seguras 9:16 (15% topo / 25% base / 16% lateral direita para IG Stories e TikTok). | `creative-core.v1`, `post-feed-estatico.v1`, `story-vertical.v1`, `judge.py` |

## Regras centrais da skill `on-image-copy.v1`

1. **Alinhamento ao perfil (`brandVoice`):** lê `tone` (tom de voz), `examples` (frases reais do perfil) e `avoid` (termos/estilos proibidos), somados à persona e aos critérios aceitos de mensagem. Se `brandVoice` estiver vazio, infere discretamente do briefing sem artificialismo.
2. **Engenharia do gancho na imagem:** exige um gatilho concreto (Quebra de Premissa, Dor + Cena Específica, Prova/Número Real Declarado, Mecanismo Concreto ou Chamada Direta ao Perfil) validado pelo **Teste da Troca de Concorrente** (se outro perfil puder assinar a mesma manchete, ela está genérica demais).
3. **Economia de palavras e micro-copy de carrossel:**
   - Manchete principal: **2 a 7 palavras** legíveis a 360 px.
   - Sub-gancho opcional: até **14 palavras**.
   - Lâminas internas de carrossel: **1 ideia por lâmina** + corpo de até **28 palavras** + ponte natural (*open loop* / *bucket brigade* em PT-BR como *"O detalhe?"*, *"Na prática:"*, *"Só que tem um porém:"*).
4. **Anti-clichês de IA em PT-BR:** proíbe estruturas desgastadas (*"Não é sobre X, é sobre Y"*, tripletos *"Sem X, sem Y, sem Z"*, *"Você sabia que..."*, *"5 dicas imperdíveis"*, *"destrave"*, *"revolucione"*, *"eleve seu nível"*, *"game-changer"*) e travessões empilhados.
5. **Fatos como ordem:** jamais inventa preços, datas, bônus, urgência ou provas sociais não declaradas em `offerFacts` confirmados.
6. **Ajuste conversacional antes dos pixels:** o botão **"Refinar copy com IA"** no editor (e comandos de chat como *"melhorar copy"*, *"variar gancho"*, *"revisar lâmina 2"*) dispara apenas turno textual/ferramentas de texto e plano, sem acionar geração de imagem até confirmação humana.

## Proporções e zonas seguras adotadas

| Modo na UI | Chave interna | Proporção | Resolução (`images-api`) | Lâminas | Zonas seguras aplicadas |
| --- | --- | --- | --- | --- | --- |
| Post único | `single` | `4:5` | `1024x1280` | `1` | Margens externas confortáveis e conteúdo crítico dentro do recorte central `3:4` da grade do perfil. |
| Carrossel | `carousel` | `4:5` | `1024x1280` | `3–10` (padrão `5`) | Mesmo sistema de margens em todas as lâminas, numeração discreta consistente e capa legível no recorte `3:4`. |
| Coleção | `collection` | `4:5` | `1024x1280` | `2–10` (padrão `3`) | Unidade fotográfica ancorada na Foto 1; fotos internas sem texto (ou rótulo mínimo se pedido). |
| Story | `story` | `9:16` | `864x1536` | `1` | Topo `15%` (avatar/progresso), Base `25%` (campo de resposta/ações) e Lateral direita `16%` (compatibilidade com ícones de Reels/TikTok). Guia opcional somente na UI (nunca gravado no PNG). |
