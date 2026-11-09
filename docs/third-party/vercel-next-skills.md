# Skills do Next.js da Vercel

Matheus pediu em 09/11/2026 as skills da Vercel para Next.js no nível do projeto, para o Claude Code e para o Codex. São seis skills, copiadas sem alteração:

| Skill | Uso no Compor |
| --- | --- |
| `next-bundle-optimizer` | Padrão para auditar e reduzir o JavaScript inicial do app. |
| `next-dev-loop` | Conferir uma mudança no `next dev`. Depende de `agent-browser` instalado globalmente, que exige decisão de Matheus. |
| `next-cache-components-adoption` | Adotar Cache Components. É uma decisão de Matheus. |
| `next-cache-components-optimizer` | Só depois de adotar Cache Components. |
| `next-partial-prefetching-adoption` | Adotar Partial Prefetching. É uma decisão de Matheus. |
| `next-partial-prefetching-optimizer` | Só depois de adotar Partial Prefetching. |

## Origem

- Repositório: [vercel/next.js](https://github.com/vercel/next.js/tree/0cf3769051fbc0e09346624f1f5bd26159df5875/skills), pasta `skills/`, commit `0cf3769051fbc0e09346624f1f5bd26159df5875`.
- Instalação: `npx skills add vercel/next.js --skill '*' --agent claude-code --agent codex --copy`, a partir da raiz.
- Cópias: `.claude/skills/<skill>` para o Claude Code e `.agents/skills/<skill>` para o Codex. As duas pastas são idênticas.
- Hashes: `skills-lock.json`, gerado pela instalação. O `SKILL.md` de `next-bundle-optimizer` e o de `next-dev-loop` foram conferidos byte a byte com o commit acima.

Para atualizar, rode o mesmo comando, revise o diff das duas pastas e registre o novo commit aqui.

## Restrições no Compor

- Não rode `npx @next/codemod … agents-md`. O `AGENTS.md` é mantido por Matheus, e `apps/web/next.config.mjs` define `agentRules: false` por isso.
- `@next/codemod upgrade`, `next upgrade`, instalações globais e a ativação de `cacheComponents` ou `partialPrefetching` exigem decisão de Matheus.
- As skills sugerem instalar outras skills com `npx skills add`. Instale só depois de revisar o conteúdo.

## Licença

As skills são distribuídas sob a licença MIT do repositório de origem:

> The MIT License (MIT)
> 
> Copyright (c) 2025 Vercel, Inc.
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
