# Handoff — feedback do estúdio

Escrito em 09/11/2026, 23:55 UTC, pelo agente Claude Code. O próximo agente é do Codex.

Este arquivo existe só enquanto a branch `compor/feedback-estudio` estiver aberta. Remova-o no PR final para a `main`.

## Objetivo

Matheus testou o estúdio web e deixou sete pontos de feedback. Eles viraram as issues #22 a #27. No mesmo dia ele pediu mais uma mudança, que virou a issue #33. O plano está nos ADRs 0029 a 0034 e no `GLOSSARY.md`.

Todo o trabalho entra na branch de integração `compor/feedback-estudio`. A `main` recebe um único merge no fim.

## Faça primeiro

Estes passos estavam em andamento quando este arquivo foi escrito.

### 1. Integrar os PRs #29 e #30

Os dois PRs estavam com o CI rodando. Os jobs estático, contratos e performance já tinham passado. Faltava o job "Web types and behavior".

| PR | Issue | Branch | Commit | Base atual |
| --- | --- | --- | --- | --- |
| [#29](https://github.com/MathBorgess/compor/pull/29) | #22 Agente opinativo | `feat/22-agente-opinativo` | `d25de70` | `compor/feedback-estudio` |
| [#30](https://github.com/MathBorgess/compor/pull/30) | #23 Enter e título curto | `feat/23-enter-titulo` | `c2c4f6c` | `feat/22-agente-opinativo` |

O #30 está empilhado sobre o #29. Faça nesta ordem:

```bash
gh pr checks 29 --repo MathBorgess/compor
```

```bash
gh pr checks 30 --repo MathBorgess/compor
```

Se o check **Quality gate** estiver verde nos dois:

```bash
gh pr merge 29 --repo MathBorgess/compor --merge
```

```bash
gh pr edit 30 --repo MathBorgess/compor --base compor/feedback-estudio
```

```bash
gh pr merge 30 --repo MathBorgess/compor --merge
```

Use merge commit, não squash. O squash quebra a pilha.

Se um check falhar, leia o log antes de qualquer nova execução:

```bash
gh api --allow-escape-sequences repos/MathBorgess/compor/actions/jobs/<id-do-job>/logs | sed 's/\x1b\[[0-9;]*m//g' | grep -E "✖|ℹ (tests|pass|fail)"
```

As falhas anteriores destes PRs já foram corrigidas:

- No #29, o teste `studio-flow-browser.test.mjs` media o compositor durante a animação de 180 ms da conversa. O commit `d25de70` espera a animação terminar.
- No #30, os sete testes de `studio-enter-title-browser.test.mjs` não enviavam o cookie de sessão. O commit `c2c4f6c` envia o cookie.

### 2. Corrigir os achados da revisão dos PRs #29 e #30

Uma revisão independente não achou bloqueador. Ela achou quatro pontos que merecem correção. Nenhum foi corrigido ainda. Faça um PR para cada feature, depois dos merges acima.

**#22, agente opinativo:**

1. `apps/web/lib/studio-state.ts`, função `pendingSelectionQuestion`. A função só olha a última mensagem. Se a pessoa edita o briefing ou remove uma referência enquanto a pergunta está pendente, um novo turno automático começa, a função devolve `null` e a exploração gera imagens durante o turno. Se esse turno falhar, a espera some de vez.
2. `packages/agents-api/src/taste-reading.mjs`, função `questions`. O contador ignora `?` seguido de `!`, `.`, `…`, `,`, `*`, `—` ou letra. Uma resposta como `"**Prefere quente?** Ou frio?"` passa com duas perguntas. O teste atual só cobre `?` seguido de espaço.

**#23, título curto:**

3. `packages/agents-api/src/studio-chat-tools.mjs` e `studio-chat.mjs`. Se o modelo chama `compor_renomear_projeto` com mais de 48 caracteres, o turno fica `running` para sempre e o chat para em "Consultar esta tentativa". O revisor não achou caminho de liberação. Opções: cortar o título no servidor, ou encerrar o turno como falha.
4. `apps/web/lib/project-title.ts`, função `isProvisionalTitle`. O título é "provisório" por igualdade de texto. Se a pessoa recusa a proposta, o agente pode propor de novo em cada sessão. Se a pessoa edita a ideia antes de enviar, o agente nunca propõe.

Pontos menores, para decidir se valem um PR:

- `studio-chat.mjs`: a checagem de segredo roda no JSON bruto, não nos campos decodificados. A chave não entra no contexto do modelo, então é só defesa extra.
- `use-exploration-loop.ts`: `resumedQuestion` vive só em memória. Depois de "Gerar mais propostas", recarregar a página volta a segurar a exploração na mesma pergunta.
- Nenhum ADR registra o limite de 48 caracteres da ferramenta, o campo `projectTitleProvisional` nem a renomeação por iniciativa do agente. Só `docs/architecture.md` trata disso.

### 3. Publicar a suíte web paralela

A branch `ci/web-rapido` está no remoto, sem PR. Ela foi rebaseada sobre `feat/23-enter-titulo` (`c2c4f6c`).

O que ela faz:

- Roda dois arquivos de teste por vez com `apps/web/test/run.mjs`.
- Dá a cada processo um diretório de saída do Next (`.next` ou `.next/test`) por `apps/web/test/next-dist-dir.mjs`.
- Começa pelos quatro arquivos mais lentos.
- Fecha conexões antes de `server.close` em dois testes que podiam travar a suíte.

O que foi medido: localmente, 285 de 285 testes em 293 s, contra cerca de 474 s em série. No CI o job web leva cerca de 15 minutos em série.

O que não foi medido: a suíte paralela no CI. O runner privado tem 2 vCPUs, então o ganho deve ser menor e os testes com espera fixa de 5,5 s podem ficar instáveis.

Passos:

1. Depois dos merges do passo 1, rebaseie `ci/web-rapido` sobre `origin/compor/feedback-estudio`.
2. Em `docs/quality/gates.md`, na seção "Suíte web paralela", atualize o item que cita a falha "the composer stays at the conversation bottom". Ela foi corrigida em `d25de70`.
3. Abra o PR para `compor/feedback-estudio`.
4. Compare o tempo do job web com o anterior e registre o número medido em `docs/quality/gates.md`.
5. Se um teste falhar só em paralelo, ache a causa. Não repita o CI até passar. Se a suíte ficar instável no runner de 2 vCPUs, não integre.

## Onde está cada coisa

| Item | Estado | Onde |
| --- | --- | --- |
| ADRs 0029–0031 e glossário | Integrado | PR #21 |
| Gates por área, limites de tempo, minutos cobrados (ADR 0032) | Integrado | PR #28 |
| Skills do Next da Vercel para Claude e Codex | Integrado | PR #31 |
| #27 TBT: entrada sem sessão em HTML sem runtime (ADRs 0033, 0034) | Integrado | PR #32 |
| #22 Agente opinativo | CI rodando | PR #29 |
| #23 Enter envia e título curto | CI rodando | PR #30 |
| Suíte web com dois arquivos por vez | Branch no remoto, sem PR | `ci/web-rapido` |
| #24 Revisão com imagem, título, legenda e PNG | Não começou | — |
| #25 Faixa de contexto e público único | Não começou. Precisa de protótipo antes | — |
| #26 Variantes viram cards no canvas | Não começou. É a última | — |
| #33 Referências sugeridas e volta às referências | Só a issue. Depende de decisões de Matheus | — |

As issues só fecham no merge para a `main`. Um PR para a branch de integração não fecha issue.

As issues #2, #14 e #19 estão fora deste trabalho.

## Regras que Matheus definiu

- O agente integra os PRs sozinho na branch de integração, com merge commit e com o check **Quality gate** verde.
- Não repita o CI até passar. Ache a causa.
- Não mude os orçamentos de `scripts/quality/budgets.json` nem acrescente exceções para passar.
- Deploy só depois de todas as issues. Não mova o domínio antes do teste de Matheus.
- O teste de comportamento com o modelo real é de Matheus e acontece no fim. Testes automáticos usam serviços simulados e nunca fazem chamada paga.
- Credenciais são de Matheus. O agente não digita chave OpenAI nem faz login na Vercel.
- Migrations só chegam à produção no merge final para a `main`. O workflow de migrations roda em todo push para a `main`. Matheus escolheu não criar backup.
- A exploração de imagens espera a resposta à pergunta do turno de seleção (ADR 0029).
- São decisões de Matheus, não do agente: upgrade do Next, codemod `agents-md`, `cacheComponents`, `partialPrefetching` e instalações globais. O `AGENTS.md` é dele.
- Meta de custo: no máximo 1.500 minutos cobrados de GitHub Actions por mês. Nenhum job passa de 20 minutos.
- Relatórios em português, curtos.

## Como trabalhar neste repositório

1. Crie a branch a partir de `origin/compor/feedback-estudio`.
2. Leia `AGENTS.md`, o ADR da issue e a issue. Os critérios de aceite estão na issue.
3. Use `gh` sempre com `--repo MathBorgess/compor`. O remoto local ainda aponta para o nome antigo do repositório.
4. Rode antes de abrir o PR: `npm run quality:lint`, `npm run quality:typecheck`, `npm run quality:unit` e `npm run quality:browser`. O último precisa de `BROWSER_EXECUTABLE_PATH`.
5. Para rodar um arquivo de teste de navegador sozinho, entre em `apps/web` e use `node --import tsx --test --test-timeout=90000 test/<arquivo>.test.mjs`.
6. Abra o PR para `compor/feedback-estudio`. Um PR só de Markdown custa cerca de 2 minutos de CI. Um PR em `apps/web` custa cerca de 19.

Armadilhas que já custaram uma execução de CI:

- **Pacotes copiados.** O `.npmrc` usa `install-links=true`. Os pacotes `@compor/*` são copiados para `apps/web/node_modules`, não ligados. Depois de mudar um pacote em `packages/` ou trocar de branch, rode `npm ci --prefix apps/web`. Sem isso, os testes de navegador usam o pacote antigo.
- **Cookie de sessão nos testes.** Um teste de navegador que simula pessoa conectada precisa de `context.addCookies([sessionCookie(origin)])`, de `apps/web/test/session-cookie.mjs`. Sem o cookie, `/` responde a entrada leve do ADR 0034 e o estúdio não carrega.
- **Animação da conversa.** Reabrir a conversa repete uma animação de 180 ms. Uma medição de layout precisa esperar `getAnimations()` terminar.
- **`next-env.d.ts`.** Os testes alteram `apps/web/next-env.d.ts`. Desfaça com `git checkout -- apps/web/next-env.d.ts` antes de commitar.
- **Espaço de JavaScript.** O total do cliente está em 295.959 bytes gzip. O limite é 300.000. Sobram cerca de 4.000 bytes. Rode `next analyze` antes e depois de mexer no cliente (ADR 0033) e remova código antes de acrescentar.

## Ordem do que falta

1. Os três passos de "Faça primeiro".
2. Issue #24, Revisão.
3. Protótipo descartável do layout das issues #25, #26 e #33. Matheus escolhe o layout por capturas de tela. Não integre o protótipo.
4. Issue #25, Faixa de contexto e público único.
5. Issue #33, depois das decisões de Matheus.
6. Issue #26, Variantes. A migration vai num commit próprio e por último.

## Fechamento

1. Remova este arquivo.
2. Abra um PR único de `compor/feedback-estudio` para a `main`, com o Quality gate inteiro verde. O merge dispara as migrations.
3. Faça o deploy sem mover o domínio, com `npx vercel`. Matheus faz o login.
4. Matheus testa com o modelo real: seleções contraditórias, insistir depois da contestação, mudança de estilo e sugestão de título.
5. Promova o deploy depois do teste.

## Decisões pendentes de Matheus

- **Issue #33.** Quatro decisões estão listadas na issue: a fonte das sugestões iniciais, o que conta como referência bem-sucedida, se a geração começa só com a ideia e onde fica a volta às referências.
- **Caminho antigo da tela de criação** (`COMPOR_STUDIO_WEB_ENABLED=false`). Ele ocupa 15.684 bytes gzip que só ele usa (ADR 0033). Remover libera o espaço de que as próximas issues precisam, mas tira o interruptor que desliga o estúdio. A issue #27 prevê a remoção se o espaço for relevante. Confirme com Matheus antes.
- **ADR 0034** está como `proposed`. Falta a revisão de Matheus.
- **Títulos antigos.** Projetos criados antes da #23 têm títulos de até 120 caracteres e nunca recebem proposta de título curto.
- **Foco.** Depois da resposta do agente, o foco não volta para a caixa de mensagem.
- **CSP.** A entrada leve não envia cabeçalho CSP.

## Pendências fora do repositório

- A política pessoal de Matheus pede uma nota na `mathai-wiki` com as decisões desta sessão. A nota não foi escrita. O hub é `wiki/projects/criatividade-computacional/`. Registre o feedback declarado, as regras desta seção "Regras que Matheus definiu" e o pedido que virou a issue #33, com data de 09/11/2026 e fonte "sessão do Claude Code".

## Evidências

- Performance no CI depois da #27: [docs/quality/performance-ci-2026-11-09.md](docs/quality/performance-ci-2026-11-09.md). Cinco execuções seguidas com TBT mediano de 0 ms.
- Nenhuma execução foi feita na `main`. Nenhum deploy foi feito. Nenhum teste usou o modelo real.
