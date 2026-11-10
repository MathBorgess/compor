# Isolamento físico da suíte web

Fonte de produto: `55a8920222297e70266e765d6db493e34c99c60c` (contexto #25). Esta mudança afeta o runner e seus testes; não altera `app`, `lib`, pacotes ou configurações de produção. O limite de 90 s por teste, concorrência de dois arquivos, ordem dos arquivos e orçamento do job de 20 minutos permanecem.

## Falha que motivou a correção

O [CI 52 do PR 40](https://github.com/MathBorgess/compor/actions/runs/42748750334), no mesmo SHA, terminou com 290/292 testes web aprovados, duas falhas, zero skips/cancelamentos e 448,62 s. A exploração preflight recebeu HTTP 500 com `Unexpected end of JSON input` em `loadManifest` do Next/Webpack, antes do dispatch do modo 413. O teste de títulos recebeu `Router action dispatched before initialization`. Os ajustes anteriores de captura e conclusão de poll passaram; estático, contratos e performance também passaram.

Dois diretórios de saída não bastavam: ambos os servidores observavam o mesmo `app/`, onde os testes criam e removem páginas. O isolamento de mensagens HMR em chamadores específicos não elimina a atualização de manifests no servidor. O runner agora prepara duas árvores privadas antes de iniciar qualquer teste, preservando o transporte e a API nativa do `node:test`.

## Fronteira e propagação de resultados

Fontes e configurações são cópias físicas; dependências instaladas compartilham apenas arquivos imutáveis por hardlink, com fallback de cópia. Diretórios e links relativos ficam dentro de cada worker. Os clones são irmãos do checkout, para a descoberta de lockfiles do Next não alcançar o repositório original. Cada wrapper reserva um slot livre com `wx`, muda `cwd` e importa dinamicamente o arquivo de teste copiado. Cada worker usa seu `.next` próprio.

Onze testes Node locais passaram, cobrindo inodes privados, mutação sem tocar origem/outro worker, dependências e links relativos, exclusão de caches, erro de symlink externo, espera das cópias irmãs antes da limpeza, claims concorrentes, release idempotente e resultado do runner real. Os probes copiam o runner byte a byte: descoberta vazia, falha de teste e erro de import retornam 1; sucesso retorna 0. O filho registra que seu workspace ainda existe no próprio exit, e o parent só depois o remove.

## Controle adversarial em dois núcleos

Um servidor Turbopack e outro Webpack foram iniciados em árvores privadas, com afinidade nas CPUs 0 e 1 e sem outra carga pesada. O controle confirmou as raízes efetivas pelo `findRootDirAndLockFiles` do Next instalado: `workers/0` e `workers/1`, cada um com `cwd` em seu `apps/web`. A página de origem e suas duas cópias tinham três inodes distintos.

O worker A criou e removeu uma rota oito vezes, enquanto B recarregava. O teste observou sockets HMR reais em ambos, sem interceptação: 16 eventos da rota em A, nenhum em B; 83/26 frames HMR no total. Os oito reloads de B responderam 200. Ambos tiveram zero erros de página e HTTP 500. Nove manifests JSON existentes no dist de B foram descobertos e validados. O controle passou 1/1 em 30,23 s, incluindo 5,25 s para preparar as árvores.

Três tentativas anteriores falharam no próprio observador, não no produto: `.includes` aplicado a `data` que não era lista; expectativa incorreta de `webpack-hmr` em vez do endpoint real `hmr`; e caminho de manifest anterior ao subdiretório `dev` do Next 16. Essas tentativas não são contadas como passes. Os logs e fontes foram preservados com os sufixos `frame-parser-failed`, `endpoint-expectation-failed` e `manifest-path-failed`.

Fonte e log finais: `/workspace/scratch/private-browser-workers-adversarial.mjs` e `.log`. O log registra caminhos, inodes, sockets, eventos e manifests. Esses dados são um controle local de isolamento, não evidência do CI ou uma comparação causal de desempenho.

## Suíte completa e CI

A execução completa única em dois núcleos terminou com 302/303 aprovados, uma falha e zero skips/cancelamentos. O runner mediu 455,07 s; o relógio monotônico externo mediu 460,27 s, incluindo o preparo. Onze testes de infraestrutura foram acrescentados aos 292 testes da fonte de produto. Não havia outra carga pesada. Log: `/workspace/scratch/private-browser-workers-full-2cpu.log`.

Todos os casos Next passaram, inclusive preflight (44,37 s), títulos (3,39 s) e receipt (21,79 s), sem os erros anteriores de manifest ou inicialização do roteador. A falha restante foi no teste cliente/esbuild `studio-reference-trigger-browser.test.mjs:47`: a comparação de contagem após uma espera fixa de 5,5 s encontrou zero chamadas em vez de uma. O produto agenda a iniciativa em 5 s e ainda precisa ler o contexto antes do dispatch.

As observações positivas desse arquivo agora aguardam o handler HTTP dentro do limite de UI já existente de 7 s; a persistência lenta mantém 12 s. Quando o passo seguinte depende de conclusão, o teste também aguarda a resposta exibida. As observações negativas de 5,5 s, 2 s e 500 ms e todos os asserts de contagem, escopo e reload permanecem. Nenhum timer de produção ou limite por teste aumentou.

O cenário que falhou inclui uma leitura de feedback simulada com 900 ms. O controle negativo registrou zero chamadas em 5,5 s, mas observou o dispatch em 5.924,91 ms, dentro dos mesmos 7 s; só então reprovou a comparação antiga. Essa prova terminou em 13,37 s. O arquivo corrigido passou 8/8 em 104,91 s, em dois núcleos. Fonte/log do negativo: `/workspace/scratch/private-browser-workers-timer-negative{-source.mjs,.log}`; foco: `private-browser-workers-timer-focused.log`.

Lint, tipos, ESLint dos testes alterados e 20/20 testes dos gates passaram. Depois da causa identificada, prova negativa e foco, a execução completa corrigida passou **303/303**, com zero falhas, cancelamentos ou skips, em **412,50 s de suíte e 416,95 s de relógio**, com a mesma afinidade de dois núcleos e sem outra carga pesada. Log: `/workspace/scratch/private-browser-workers-full-2cpu-fixed.log`.

O cleanup foi conferido: nenhum processo permaneceu com `cwd` nas árvores privadas e nenhum diretório dessa execução restou. O checkout original não teve alteração em `app`, `lib`, pacotes, `next.config.mjs`, `tsconfig.json` ou `next-env.d.ts`.

As duas execuções completas têm fontes de teste diferentes e não formam uma comparação causal de velocidade; nenhum percentual de ganho é atribuído a elas. O controle de fronteira, a sincronização de dispatch e a aprovação integral são evidências separadas. Nenhuma medição de produto/Lighthouse foi repetida por essa mudança de infraestrutura. O CI do runner novo ainda não foi executado.
