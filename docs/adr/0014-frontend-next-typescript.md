---
status: accepted
date: 2026-11-05
---

# Frontend Next.js com TypeScript estrito

## Contexto e decisão

Matheus pediu migrar a codebase web para Next.js em TypeScript/TSX em 05/11/2026. O app já utilizava Next.js; esta decisão tipa componentes, rotas e lógica de produção, em vez de trocar o framework. `apps/web/app` e `apps/web/lib` usam `.tsx` e `.ts`, `strict: true` e build sem ignorar erros de tipo. Testes e ferramentas podem continuar em MJS.

Dados externos são validados em runtime. Pacotes JavaScript compartilhados expõem declarações `.d.ts` precisas para o consumidor Next. Declarações não substituem schemas nem verificam a implementação JavaScript.

A entrada renderiza sob demanda. O estúdio carrega por importação dinâmica após a sessão. O site público continua Astro estático em `apps/site`. A escolha entre renderização estática e dinâmica acompanha o dado; o estado privado não entra em cache compartilhado.

## Consequências

Componentes de cliente podem importar domínio e utilitários próprios do navegador; configuração e adaptadores de servidor ficam fora desse grafo. `lib` não é uma garantia de compatibilidade com o cliente. Essa fronteira ainda exige revisão, pois não há regra geral de imports entre camadas no ESLint.

Manter os pacotes compartilhados em JavaScript reduz o escopo da migração, mas exige sincronizar suas declarações e testes. O estado local do estúdio permanece validado, versionado e separado por conta/projeto. O [ADR 0012](0012-arte-integral-e-deliberacao-adaptativa.md) define a arte integral e a decisão humana.

## Verificação exigida

`quality:typecheck` verifica tipos; `quality:lint` rejeita `any`, supressões TypeScript e JS de produção nas duas pastas Next. `quality:browser` verifica interação e isolamento local; `quality:build` verifica a saída de produção. Lighthouse mede somente a entrada sem sessão. Veja [gates](../quality/gates.md).
