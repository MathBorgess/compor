# ADR 0033 — Turbopack com análise guiada do bundle

- Estado: accepted
- Data: 09/11/2026
- Fonte: pedido de Matheus em 09/11/2026, "utilizando turbopack, ajuste guiado, adicione também como adr e link fácil para AGENTS.md para sempre otimizar o turbopack", com o guia [Optimizing package bundling](https://nextjs.org/docs/app/guides/package-bundling) do Next. Na mesma data, ele autorizou a skill `next-bundle-optimizer` para a auditoria e correções de tamanho e pediu as skills do Next da Vercel no projeto. Issue #27.

## Contexto

O job de performance falhava pelo TBT da entrada `/` sem sessão. Um build com `next build --webpack` manteve a tarefa longa de cerca de 150 ms a 5,6× de CPU e subiu o JavaScript de todos os chunks para 405.849 bytes gzip, acima do limite de 300.000. O Turbopack, padrão do Next 16, gerava 294.602 bytes.

O analisador do Turbopack, no snapshot `compor-27-before-bb67142`, mostrou que o grafo síncrono de cliente da rota `/` tem o runtime do Next e o React DOM, com 169.041 bytes atribuídos, mais `workspace.tsx`, `session-state.ts`, `brand-symbol.tsx` e CSS, com cerca de 3 KB. O estúdio (104.901 bytes atribuídos) e o caminho legado (53.320) já carregam por import dinâmico. Nenhum pacote com muitas exports aparece no grafo síncrono. `optimizePackageImports` e `serverExternalPackages` não tinham alvo, e nenhuma configuração foi acrescentada. O zod soma 34.533 bytes atribuídos num chunk dinâmico e mantém `toJSONSchema`, porque cada schema clássico expõe esse método.

## Decisão

O app web continua no Turbopack para build e desenvolvimento. Trocar de bundler exige outro ADR com as duas medições de bytes e de TBT.

Antes e depois de acrescentar uma dependência de cliente, mover código entre servidor e navegador, ou quando o orçamento de JavaScript apertar, rode em `apps/web` o analisador com nomes distintos e exporte cada snapshot para fora do repositório:

```sh
set -o pipefail
npx --no-install next analyze --output --snapshot 'antes-<assunto>'
npx --no-install next analyze export --snapshot 'antes-<assunto>' | gzip > /caminho/fora-do-repo/antes.jsonl.gz
```

Compare o mesmo escopo e a mesma métrica entre os dois snapshots. Siga o guia: `optimizePackageImports` para pacotes com muitas exports que o Next não otimiza sozinho, renderização de dados em Server Components quando o trabalho não precisa do navegador, e `serverExternalPackages` para pacotes pesados usados só no servidor. Acrescente configuração somente quando o analisador mostrar ganho.

As seis skills do Next publicadas pela Vercel ficam no projeto, em `.claude/skills/<skill>` para o Claude Code e em `.agents/skills/<skill>` para o Codex. Origem, licença e restrições estão em [vercel-next-skills](../third-party/vercel-next-skills.md).

`next-bundle-optimizer` é a skill padrão para trabalho de bundle. O modo padrão dela é auditoria, e correções de tamanho exigem pedido explícito. Mudar comportamento visível, tempo, compatibilidade ou fronteira de confiança, remover estado privado do cliente, mover política ou acrescentar `server-only` continuam decisões de Matheus. O codemod `agents-md`, upgrades do Next, instalações globais e ligar `cacheComponents` ou `partialPrefetching` também são decisões dele.

## Limites

O analisador informa bytes comprimidos atribuídos por módulo, não transferência medida nem economia prevista. Seus totais não equivalem ao gzip por arquivo do gate: 347.426 bytes atribuídos contra 294.602 medidos pelo gate no mesmo build.

O analisador não mede tempo de execução. A tarefa longa da entrada vinha da inicialização do App Router e do React. Uma página sem componentes de cliente manteve a mesma tarefa, e reduzir bytes não removeria esse custo. A entrada é tratada em registro próprio.

Um snapshot local não substitui o job de performance no CI Linux. O caminho legado (`COMPOR_STUDIO_WEB_ENABLED=false`) tem 15.684 bytes atribuídos que só ele usa; removê-lo é decisão de produto, fora deste registro.
