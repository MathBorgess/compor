---
status: accepted
date: 2026-11-05
---

# Gates explícitos de qualidade, manutenção e performance

## Contexto e decisão

Matheus pediu GitHub Actions e critérios claros de qualidade, manutenção e performance em 05/11/2026. O workflow `Quality` executa em PR, push para `main` e acionamento manual. O check agregado **Quality gate** só passa se todos os cinco jobs passarem; falha, cancelamento e job ignorado impedem sua aprovação.

O código do workflow não configura proteção de branch. Exigir esse check no GitHub é uma configuração separada. CI não faz deploy, não recebe secrets e não executa geração paga.

## Critérios automáticos

| Job | Bloqueio |
| --- | --- |
| Static checks | ESLint, regras TS/TSX e testes do avaliador de orçamento |
| Contracts and data isolation | Suítes de pacotes, protótipo e scripts de migração |
| Web types and behavior | TypeScript estrito e suíte web com Chromium obrigatório |
| Public site build | `astro check` e build estático |
| Production performance | Build Next e limites de bundle/Lighthouse |

Os limites ficam em `scripts/quality/budgets.json`: JS inicial até 250.000 bytes gzip, todos os chunks até 300.000 bytes gzip, mediana de cinco execuções mobile de LCP até 2.500 ms, TBT até 200 ms e CLS até 0,1. Métrica ausente, console com erro, erro HTTP ou navegação para outra página falham. Os resultados medem a entrada sem sessão e configuração sintética; não medem geração, sessão autenticada ou INP de usuários reais.

Dependências usam lockfiles, instalações usam `npm ci --ignore-scripts` e Actions usam SHAs fixos. O navegador vem do Playwright fixado. Artefatos de diagnóstico ficam disponíveis por cinco dias. O gate não deve ser contornado reduzindo cobertura ou alterando limites sem justificativa revisável.

## O que exige revisão

Complexidade acima de 20 é diagnóstico, não limiar de bloqueio. Fronteiras de imports, tamanho e responsabilidade dos módulos, suficiência dos testes, fidelidade visual, acessibilidade completa, segurança em ambiente remoto e qualidade criativa continuam sob revisão. A documentação não implica que um verificador automático dessas propriedades exista.

SSR, geração estática, importação dinâmica e otimização de imagens dependem do uso da rota. Não converter dados privados em cache público ou alterar os bytes de uma arte para satisfazer o benchmark. Resultados locais e de CI precisam ser identificados separadamente. Os [gates detalhados](../quality/gates.md) são a referência operacional.
