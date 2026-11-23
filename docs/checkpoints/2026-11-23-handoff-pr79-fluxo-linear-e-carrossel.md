# Handoff & Plano Unificado de Execução — PR #79 (`test/carrossel-conflitos-interface`)

**Data do checkpoint:** 23/11/2026  
**Branch:** `test/carrossel-conflitos-interface` (baseada em `99c8ec3`, 1 commit à frente de `origin/main` `d4ee9be`)  
**Worktree ativo:** `/Users/matheusborges/github/.worktrees/compor-carrossel-conflitos-interface`  
**PR associado (em draft):** [PR #79](https://github.com/MathBorgess/compor/pull/79)  
**Dossiê completo de UX, UX Writing e Gamificação versionado na branch:** [`docs/design/2026-11-23-dossie-ux-fluxo-linear.md`](../design/2026-11-23-dossie-ux-fluxo-linear.md)

> **Como usar este handoff (para o próximo agente):**  
> As fases de descoberta, entrevista, aprovação do `/plan` e os **Milestones M1 e M2 já foram concluídos e verificados** neste worktree. **Não refaça M1 nem M2, não reverta as alterações atuais do worktree e não re-entreviste o usuário.** Comece diretamente pelo **Milestone M3** seguindo as especificações e invariantes abaixo.

---

## 1. Decisões Já Aprovadas por Matheus (Congeladas)

1. **Escopo unificado deste PR único:**
   - **Bloco 1 do Dossiê (3 pacotes UX):** `F01` a `F15`, `W01` a `W20`, `G1` a `G7` e `Specs A–E`.
   - **Bloco 2 do Dossiê (5 adendos de ADR + mudanças de interface):** funil de 2 telas com IA inline (`0044`/`0058`), `StudioAssets` passivo com vínculo canônico (`0031`/`0077`), selo `★ Pronto para postar` + checkboxes de fatos no `<StudioReview>` (`0031`), `<ReviewDisclosureBadge compact />` (`0075`) e nome inicial distinto para o 1º post (`0073`).
   - **Refinamentos validados pela Persona (Camila Rocha):** vocabulário único de 3 estados (`Em criação` → `Pronto para postar` mapeado a `approval.status === 'approved'` → `Postado ✓`), zero termos em inglês (`"Active Memory Card"` proibido), zero selo estético não verificável (`"Direção visual consistente"` proibido) e zero marcação automática `✓` de fatos sem conferência humana.
   - **Conflitos de interface do carrossel (PR #79):** `governed-carousel-browser.test.mjs`, `studio-artwork-transport-browser.test.mjs` (sem `{todo}`) e `studio-credential-source-browser.test.mjs`.
2. **`<StudioReview>` (`Spec C` vs. Carrossel/Coleção/Story `ADRs 0080–0084`):**
   - **Aprovado:** Unificar o *Kit Pronto para Postar* (`postTitle`, `white-space: pre-wrap`, confirmação de download/cópia, Web Share API, ponte desktop→celular, `★ Marcar como pronto para postar` e checkboxes de fatos confirmados) **preservando integralmente** todos os fluxos de `carousel`, `collection` e `story` (`Compor lâminas`, `FrameReviewCard`, prévia da capa `3:4`, download de carrossel em ZIP com `legenda.txt` e `alt-text.json`, e `Salvar versão` na revisão).
3. **Comportamento de `Salvar versão` em versão limpa (`F05` vs. `governed-carousel-browser.test.mjs:536`):**
   - **Aprovada a Opção A (fiel ao `F05`):** Quando `!dirty && baseVersion >= 1`, renderizar `Salvo · v{N} ✓` desabilitado (`disabled`), impedindo criação acidental de versões duplicadas; `useBase` passa a marcar `dirty: true` ao trocar foto-base local; em `governed-carousel-browser.test.mjs:536`, atualizar apenas a checagem pré-plano (verificando ausência de `#studio-carousel-save-hint` antes do plano) e manter intacta a asserção pós-plano (`:disabled` na linha `544`).
4. **Formato dos 5 adendos de ADR (`docs/adr/`):**
   - **Aprovado e já implementado em M1:** Seção `## Adendo (23/11/2026)` dentro dos ADRs existentes (`0031`, `0044`, `0058`, `0073`, `0075`, `0077`) + atualização de `docs/adr/README.md` e `docs/architecture.md`.
5. **Verificação e limites Git (`AGENTS.md`):**
   - Executar **apenas os checks locais** (`npm run quality:lint`, `npm run quality:typecheck`, `npm run quality:unit`, `npm run quality:browser`, `npm run quality:build`, `next analyze` antes/depois e os 3 testes do carrossel), ignorando gates remotos de GitHub Actions.
   - **Parar em commits locais na branch `test/carrossel-conflitos-interface` sem executar `git push`, PR, merge, migrations remotas ou deploy.**

---

## 2. Estado Atual do Worktree (O que JÁ está feito)

| Milestone | Status | Evidência / Verificação |
| --- | --- | --- |
| **M1 — 5 Adendos de ADR + `docs/architecture.md` + Dossiê & Handoff** | **CONCLUÍDO (`0e7cad0`)** | Commit local `0e7cad0`. Adendos redigidos em `docs/adr/0031`, `0044`, `0058`, `0073`, `0075`, `0077` + `docs/adr/README.md` + `docs/architecture.md`. `npm run quality:test` (**115/115 aprovados**). |
| **M2 — Baseline Bundle, Conflito PR #79 (`StudioChat`), Disclosure Compacto e Nome do 1º Post** | **CONCLUÍDO (`874d58d`)** | Commit local `874d58d`. `npm run quality:lint` (**0 erros/warnings**), `npm run quality:typecheck` (**0 erros**), `packages/agents-api/test/studio-chat.test.mjs` (**78/78 aprovados**), e os **3 testes de navegador do PR #79** (`studio-artwork-transport-browser.test.mjs`, `governed-carousel-browser.test.mjs`, `studio-credential-source-browser.test.mjs`) **100% aprovados com `todo: 0`**. Snapshot Turbopack `before-unify` salvo em `apps/web/.next/diagnostics/analyze`. |
| **M3 — `<StudioReview>` Unificado, `StudioAssets` Passivo, `VariantCards` e Modal (`F10`)** | **CONCLUÍDO** | `<StudioReview>` unificado (checklist 3 passos, conferência silenciosa de `confirmedFacts`, `white-space: pre-wrap`, `★ Marcar como pronto para postar`, Web Share API, handoff desktop→celular e preservação integral de Carrossel/Coleção/Story), `StudioAssets` passivo (`canonicalStorageActive`), skeleton calmo em `VariantCards` e fix da cascata CSS das abas de configurações. `quality:lint`, `quality:typecheck` e 7/7 suítes de navegador (`studio-flow`, `project-settings-modal`, `post-formats`, `studio-assets`, `studio-variant-cards`) aprovados. |
| **M4 — Estúdio Unificado (`<PostWorkspaceHeader>`), Split Legenda/Próxima Arte, Mobile `<= 800px` e `F05`** | **PENDENTE (Próximo passo)** | Especificado na Seção 3.2 abaixo. |
| **M5 — Funil Ultralinear de 2 Telas, Referências (`F11`), Mural Visual (`F08`) e Refinamentos Persona** | **PENDENTE** | Especificado na Seção 3.3 abaixo. |
| **M6 — Alinhamento de Seletores nos Testes (`R3`), `next analyze` (`after-unify`) e Gates Locais** | **PENDENTE** | Especificado na Seção 3.4 abaixo. |
| **M7 — Revisão Final e Commits Locais Limpos (sem `git push`)** | **PENDENTE** | Especificado na Seção 3.5 abaixo. |

### Arquivos já modificados/criados em M1 e M2 (preservar no worktree)
- **Documentação e ADRs (M1):**
  - `docs/adr/0031-faixa-de-contexto-publico-unico-e-revisao.md`
  - `docs/adr/0044-preparacao-guiada-e-estudio-por-post.md`
  - `docs/adr/0058-referencias-focadas-e-aprendizados-do-perfil.md`
  - `docs/adr/0073-referencias-e-primeiro-pedido.md`
  - `docs/adr/0075-revisao-de-candidatas-a-imagem.md`
  - `docs/adr/0077-imagem-canonica-da-versao.md`
  - `docs/adr/README.md`
  - `docs/architecture.md`
- **Código e Testes (M2):**
  - `packages/agents-api/src/studio-chat.mjs` (omite instrução `generate_image` quando `body.context.content?.carouselPlan` está presente)
  - `packages/agents-api/test/studio-chat.test.mjs` (teste unitário provando que `carouselPlan` omite `generate_image` e não reutiliza sessão anterior ao plano)
  - `apps/web/studio/image-review-disclosure.tsx` (substitui `.ts`, exportando `imageReviewDisclosure`, `imageReviewDisclosureSummary` e `<ReviewDisclosureBadge compact />`)
  - `apps/web/studio/studio-chat.tsx` (suprime `.studio-image-consent` `"Gerar a arte completa"` quando `carouselPlan` está ativo, oferece botão explícito `"Recusar proposta"` via `declineBinding` sem auto-postar `/api/studio/action`, usa `<ReviewDisclosureBadge compact />` e prioriza `state.posts[pieceId]?.name` com fallback `"Novo post"` em vez de `"Post sem título"`)
  - `apps/web/lib/studio-workflow.ts` e `apps/web/lib/studio-journey-controller.ts` (`INITIAL_POST_SUGGESTED_NAME = 'Post 1 · Abertura'` para o 1º post em vez de copiar o título do projeto)
  - `apps/web/studio/studio-app.tsx`, `apps/web/studio/studio-guided.tsx`, `apps/web/studio/studio-guided.css`, `apps/web/studio/studio-reference-panel.tsx` (integração de `<ReviewDisclosureBadge>` e `initial: true` no preparo do 1º post)
  - `apps/web/test/studio-artwork-transport-browser.test.mjs` (removido `{todo: 'conflito reproduzido no estúdio'}`, validando que o cartão `"Gerar a arte completa"` não concorre com a orientação de revisão do carrossel e que `"Recusar proposta"` envia `declined` explicitamente)

---

## 3. Roteiro Técnico Detalhado para Continuar (M3 → M7)

> **Atenção crítica ao orçamento de bundle (`ADR 0033`):**  
> `totalClientJavascriptGzipBytes` está em **`298.495 / 300.000` bytes gzip** (~1,5 KB de margem).  
> - **ZERO novas dependências npm.**  
> - Prefira reutilizar helpers e estilos CSS em vez de grandes árvores JSX verbosas.  
> - Remova código morto ao substituir componentes antigos (ex.: steppers duplicados, textos longos inline duplicados).

### 3.1. Milestone M3 — `<StudioReview>` Unificado, `StudioAssets` Passivo, `VariantCards` e Modal (`F10`)

1. **`apps/web/studio/studio-review.tsx` + `apps/web/studio/studio-app.tsx` (`F01` + `ADR 0031` + Multi-formato `ADRs 0080–0084`):**
   - Em `studio-app.tsx`, passar `postTitle` como título principal do `<StudioReview>` (e usar `postTitle` como prefixo dos arquivos baixados `<postTitle>-v<N>.png` e `<postTitle>-v<N>.zip`), exibindo `projectDetails.title` apenas como eyebrow se diferente de `postTitle` (eliminando a duplicação de títulos nas telas `11` e `17`).
   - Adicionar classes `.studio-button-secondary` nos botões `"Copiar legenda"` e `"← Voltar para ajustar"` (ou `"Pedir ajuste no estúdio"`, cuidando dos seletores de teste mapeados em M6).
   - Aplicar `white-space: pre-wrap` na prévia da legenda para preservar quebras de parágrafo, exibindo contagem de parágrafos e caracteres (`{len} / 2.200`).
   - Ao concluir `download()` em `studio-review.tsx`, atualizar estado visual (`downloaded = true`) e `setNotice("Arte baixada.")` (ou rótulo vivo `"Arte baixada ✓"`).
   - Adicionar suporte a Web Share API no mobile (`navigator.canShare?.({ files })` → botão `"Compartilhar / Salvar nas Fotos"`) e `<details>` de handoff desktop→celular copiando a URL autenticada `/projetos/<id>/posts/<pieceId>` (sem segredos na URL).
   - Exibir checkboxes silenciosos de conferência humana para `confirmedFacts` (`state.offerFacts.filter(f => f.status === 'confirmed')`), **nunca pré-marcados automaticamente**.
   - Integrar botão de aprovação explícita `★ Marcar como pronto para postar` (`onApprove`, habilitado quando `isSaved && !isApproved`) e selo `★ Pronto para postar · v{N}` quando `draft.approval.status === 'approved'`, mantendo contratos de salvar, aprovar e baixar estritamente separados.
   - **Invariante inegociável:** Preservar 100% da lógica existente de `format: 'single' | 'carousel' | 'collection' | 'story'`, `Compor lâminas`, `FrameReviewCard`, `Prévia da capa no perfil (3:4)`, `Baixar carrossel em ZIP` (`legenda.txt` + `alt-text.json`) e `Salvar versão` na revisão!

2. **`apps/web/studio/studio-assets.tsx` + `apps/web/studio/studio-app.tsx` (`ADR 0031` / `0077`):**
   - Adicionar prop opcional `canonicalStorageActive?: boolean` (default `false`, para que o teste isolado `apps/web/test/studio-assets-browser.test.mjs` continue testando o fluxo manual sem quebrar).
   - Quando `canonicalStorageActive={true}` (passado por `studio-app.tsx` quando o post já tem versão salva com vínculo canônico), exibir confirmação passiva calma (`"Arte da versão {version} salva automaticamente com este post."`) e recolher o envio/recuperação manual dentro de `<details><summary>Recuperação avançada de arquivos</summary>...</details>`.

3. **`apps/web/studio/studio-variant-cards.tsx` (`F15`):**
   - Substituir o aviso alarmista `"Imagem da versão X ainda não disponível neste navegador"` durante o carregamento inicial por estado calmo `"Carregando miniatura…"`, exibindo o botão `"Recuperar imagem da versão X"` apenas quando a leitura local e remota realmente resultar vazia/ausente após a tentativa.

4. **`apps/web/studio/studio-guided.css` + `apps/web/studio/studio-app.tsx` (`F10`):**
   - Corrigir especificidade da aba ativa no modal de configurações:
     ```css
     .compor-studio .studio-modal .guided-settings-tabs button.studio-button-secondary[aria-pressed='true'] {
       border-color: var(--studio-cobalt);
       background: var(--studio-cobalt);
       color: white;
     }
     ```
   - Ocultar a aba `'history'` (`Histórico anterior`) em `settingsSections` quando o projeto não possuir mensagens legadas sem `conversationId`.

---

### 3.2. Milestone M4 — Estúdio Unificado (`<PostWorkspaceHeader>`), Split Legenda/Próxima Arte, Mobile `<= 800px` e `F05`

1. **`F05` — Estado Vivo de Salvamento + Preservação de Aviso Legado do Carrossel (`studio-app.tsx`):**
   - No botão de salvar do cabeçalho do post:
     - Quando `saving`: `"Salvando…"` (`disabled`).
     - Quando `!draft?.dirty && (draft?.baseVersion ?? 0) >= 1 && !carouselNeedsSave`: `"Salvo · v{N} ✓"` (`disabled`, classe `.is-saved`), onde `aria-label="Salvar versão"` ou compatível com testes.
     - Quando `draft?.dirty || (draft?.baseVersion ?? 0) < 1`: `"Salvar versão"` (ou `"Salvar"`).
   - Em `useBase` (`studio-app.tsx`), ao aplicar uma nova foto-base local (`!assetId`), marcar o rascunho atual como `dirty: true` para habilitar o salvamento da nova versão (`studio-version-image-browser.test.mjs`).
   - Exibir feedback de salvamento próximo ao cabeçalho (ou toast visível) **sem limpar** avisos ativos de verificação legada (`'Não foi possível verificar todas as lâminas desta versão.'` em `governed-carousel-browser.test.mjs:486-558`).

2. **`F04` & `F09` — Cabeçalho Único, Legenda Visível vs. Textos da Próxima Arte (`studio-app.tsx`, `studio-editor.tsx`):**
   - No cabeçalho do post (`studio-post-workspace-header`), exibir pílulas compactas de prontidão (`✓ Arte`, `✓ Legenda`, `✓ Salvo`), botão primário claro para ir à revisão/entrega e selo unificado (`Em criação` / `★ Pronto para postar`).
   - Em `studio-editor.tsx`:
     - Separar claramente a edição de **`Legenda`** (que atualiza imediatamente o post atual, sem o aviso de `"pixels"`) dos campos de **`Textos da próxima arte`** (`Título`, `Preço`, `Data` e campos extras, com copy humana: *"Estes campos orientam a próxima geração. A arte atual só muda quando você pedir uma nova versão."*).
     - Tornar a `Legenda` e a ação `★ Marcar como pronto para postar` (`Aprovar esta versão`) facilmente acessíveis sem ficarem enterradas abaixo de formulários longos.
     - Desacoplar o botão de zoom (`Ver arte` / `Ampliar`) da cor azul primária para não competir com a ação principal de salvar/finalizar.

3. **`F02` — Mobile Full-Width `<= 800px` (`studio-shell.css`, `studio-navigation.css`, `studio-guided.tsx`, `studio-guided.css`, `studio-chat.tsx`):**
   - Em `@media (max-width: 800px)`:
     - Ocultar `.studio-project-rail` fixo e recolher `.studio-navigation-shell[data-expanded='false']` em drawer sob demanda acionado pelo botão de menu, devolvendo 100% da largura (`390px`) ao estúdio e à revisão (mantendo os controles de navegação acessíveis no topo para `studio-flow-browser.test.mjs:177`!).
     - Adicionar switcher mobile explícito `Conversa | Arte e legenda` (mantendo ambos os painéis montados no DOM conforme `ADR 0052`), com badge `"Arte pronta"` e botão inline `"Ver arte pronta →"` no recibo de imagem do chat.
     - Remover `margin-left: auto` de `.studio-canvas-tools .studio-panel-toggle:nth-child(3)` em telas estreitas para evitar a quebra em 6 linhas vista em `16-mobile-estudio-arte.png`.

---

### 3.3. Milestone M5 — Funil Ultralinear de 2 Telas, Referências (`F11`), Mural Visual (`F08`) e Refinamentos da Persona

1. **Funil Ultralinear & `<JourneyStepper>` Único (`studio-guided.tsx`, `studio-app.tsx` — `F03`, `F06`, `F13`, `F14`, `ADRs 0044/0058`):**
   - Unificar as perguntas `O que vamos divulgar?` (`offer`) e `Quem você quer alcançar?` (`audience`) em uma única tela `<ProjectContextUnified>` com placeholders concretos, pílulas vivas (`✓ Oferta · ✓ Público`) e 3 chips `CONTEXT_EXAMPLES` clicáveis.
   - Quando `defaultAvailable === true`, exibir barra inline de IA (`"IA do Compor pronta · incluída"` + botão `"Usar minha chave OpenAI"` + `<ReviewDisclosureBadge compact />`) diretamente na preparação, permitindo avançar sem parada obrigatória na tela isolada de IA (**zero geração automática**). Quando `defaultAvailable === false`, manter a etapa explícita de escolha (`Usar minha chave` / `Continuar sem IA por enquanto`).
   - Manter `<JourneyStepper>` único e consistente em todas as telas da preparação.
   - Na Home vazia (`!hasProjects`, `F14`), ocultar o botão redundante `Novo projeto` na topbar, alinhar a ordem do DOM com a ordem visual e usar a copy `W01` (`"Seus projetos vão aparecer aqui assim que você criar o primeiro."`).

2. **Bancada de Referências (`studio-reference-panel.tsx`, `reference-workbench.css` — `F11`):**
   - Trocar `<h1 id={headingId}>` interno por `<h2>` quando já houver `<h1>` ativo no shell (eliminando dois `<h1>` simultâneos).
   - Posicionar o bloco de consentimento do Pinterest (`Permitir nesta sessão`) *acima* do input de busca quando ainda não consentido.
   - Na fonte `upload` (`Seus envios`), renderizar imediatamente a bandeja/grade de imagens enviadas em vez de apenas texto mandando abrir o `<details>` no rodapé.
   - Substituir `"Revisar seleção e alcance"` por `"Ver imagens escolhidas ({selectionCount}) e onde usar"` e `"Aplicar referências a"` por `"Onde estas inspirações valem"` (`"Só neste post"` / `"Em todos os posts deste projeto"`).

3. **Mural Visual de Posts (`<ProjectPostsGallery>` em `studio-guided.tsx` — `F08` + Persona):**
   - Exibir miniatura `4:5` real de cada post (lendo do IndexedDB local ou vínculo canônico via helper de imagem da versão), selo no vocabulário único de 3 estados (`Em criação` / `★ Pronto para postar` / `Postado ✓`), alternância `Cartões | Grade do feed (3×)` e barra factual de 2 tons (`{prontos} prontos para postar · {criacao} em criação`).
   - Zero termos em inglês (`"Active Memory Card"` proibido — usar `"Continue sua divulgação"`) e zero selo `"Direção visual consistente"`.
   - Na preparação do Post 2+ (`!initialPost`), oferecer os 4 chips `POST_ANGLE_STARTERS` (`+ Quebrar objeção`, `+ Bastidores`, `+ Benefício prático`, `+ Últimas vagas`) que apenas pré-preenchem rascunho editável sem disparar geração.

---

### 3.4. Milestone M6 — Alinhamento de Seletores nos Testes (`R3`), Bundle (`next analyze`) e Gates Locais

1. **Regra R3 para testes existentes:**
   - Atualizar `apps/web/test/guided-navigation.mjs` e apenas os seletores/rótulos de UI intencionalmente alterados nos testes de navegador afetados, **mantendo 100% das asserções de segurança, RLS, BYOK, autoridade, carrossel e zero geração automática intactas**.
   - Em `governed-carousel-browser.test.mjs:536`, conforme **Opção A aprovada por Matheus**, ajustar a verificação pré-plano do botão de salvar em versão limpa (`v1`) mantendo intacta a asserção `:disabled` pós-plano na linha `544`.
   - Lista dos principais testes de navegador para validar individualmente durante M6:
     - **Trio do PR #79 (prioridade máxima):**
       - `apps/web/test/studio-artwork-transport-browser.test.mjs`
       - `apps/web/test/governed-carousel-browser.test.mjs`
       - `apps/web/test/studio-credential-source-browser.test.mjs`
     - **Demais testes de fluxo/UI:**
       - `apps/web/test/post-formats-browser.test.mjs`
       - `apps/web/test/studio-flow-browser.test.mjs`
       - `apps/web/test/studio-chat-flow-browser.test.mjs`
       - `apps/web/test/studio-shell-browser.test.mjs`
       - `apps/web/test/studio-assets-browser.test.mjs`
       - `apps/web/test/studio-version-image-browser.test.mjs`
       - `apps/web/test/studio-post-scope-browser.test.mjs`
       - `apps/web/test/studio-reference-trigger-browser.test.mjs`
       - `apps/web/test/studio-reference-workspace-browser.test.mjs`
       - `apps/web/test/studio-url-routing-browser.test.mjs`
       - `apps/web/test/default-openai-browser.test.mjs`
       - `apps/web/test/byok-browser.test.mjs`

2. **Análise de Bundle (`ADR 0033`) e Orçamento (`scripts/quality/budgets.json`):**
   ```sh
   export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
   cd /Users/matheusborges/github/.worktrees/compor-carrossel-conflitos-interface
   (cd apps/web && npx --no-install next analyze --output --snapshot after-unify)
   ```
   - Confirmar que a soma de `.next/static/**/*.js` gzip permanece **`<= 300.000` bytes** (`initialJavascriptGzipBytes <= 250.000`). Caso ultrapasse por poucos bytes, enxugar strings/classes CSS ou helpers duplicados em `apps/web/studio/`.

3. **Sequência Completa de Gates Locais Obrigatórios:**
   ```sh
   export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
   export BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   cd /Users/matheusborges/github/.worktrees/compor-carrossel-conflitos-interface
   npm run quality:lint
   npm run quality:typecheck
   npm run quality:unit
   npm run quality:browser
   npm run quality:build
   npm run quality:test
   npm run quality:performance
   ```

---

### 3.5. Milestone M7 — Fechamento em Commits Locais (Sem `git push`)

1. Conferir `git status` no worktree `/Users/matheusborges/github/.worktrees/compor-carrossel-conflitos-interface` (garantir que não restaram artefatos temporários ou snapshots fora do `.gitignore`).
2. Criar commits locais organizados na branch `test/carrossel-conflitos-interface`.
3. **NÃO executar `git push`, NÃO alterar o PR remoto sem nova autorização explícita de Matheus e NÃO rodar migrations remotas ou deploy.**

---

## 4. Prompt Pronto para o Próximo Agente Retomar Imediatamente

Copie e cole para o próximo agente:

```text
Continue a implementação do PR #79 na branch `test/carrossel-conflitos-interface` no worktree `/Users/matheusborges/github/.worktrees/compor-carrossel-conflitos-interface`.
Leia primeiro:
1. `docs/checkpoints/2026-11-23-handoff-pr79-fluxo-linear-e-carrossel.md` (este handoff com todas as decisões aprovadas por Matheus e o estado atual)
2. `docs/design/2026-11-23-dossie-ux-fluxo-linear.md` (dossiê completo com Specs A–E, F01–F15, W01–W20 e G1–G7)

M1 (5 adendos de ADR + architecture.md) e M2 (conflito StudioChat carouselPlan, ReviewDisclosureBadge, nome do 1º post e baseline next analyze) já estão implementados e passando em quality:lint, quality:typecheck e studio-chat.test.mjs.
Retome diretamente a partir do Milestone M3 -> M4 -> M5 -> M6 -> M7, valide todos os checks locais (incluindo os 3 testes do carrossel e o orçamento de 300.000 bytes gzip do bundle) e finalize em commits locais na branch sem fazer git push.
```
