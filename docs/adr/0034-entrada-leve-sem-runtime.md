# ADR 0034 — Entrada sem sessão sem o runtime do App Router

- Estado: proposed
- Data: 09/11/2026
- Fonte: pedido de Matheus em 09/11/2026, "Production performance continua dando erro… garanta que vai passar sem estourar budget", na issue #27. O desenho foi definido na sessão de trabalho dessa issue e aguarda a revisão de Matheus no PR.

## Contexto

O job de performance falhava pelo TBT da entrada `/` sem sessão. No CI, as medianas ficaram entre 260 e 282 ms, acima do limite de 200 ms, com uma tarefa longa de 300 a 330 ms. Num perfil local a 4× de CPU, a tarefa gastava 66,8 ms no React DOM, 61,6 ms no runtime do Turbopack, 18,7 ms no runtime do Next e cerca de 7 ms em código do app. Uma página sem componentes de cliente manteve a mesma tarefa de cerca de 145 ms a 5,6×. O custo é a inicialização do App Router e do React, e o [ADR 0033](0033-turbopack-e-analise-do-bundle.md) mostra que a configuração do bundle não o remove.

## Decisão

**Entrada leve.** `apps/web/proxy.ts` responde `GET /` com HTML completo gerado por `lib/light-entry.ts`, sem script externo e sem React, quando todas as condições valem:

- a requisição não tem o cookie de sessão do Supabase, `sb-<ref>-auth-token` ou seus pedaços `.0`, `.1` e assim por diante, com `<ref>` tirado do host de `SUPABASE_URL`;
- `authConfig()` é válido;
- não é o login local de desenvolvimento;
- `COMPOR_STUDIO_WEB_ENABLED` não é `false`.

Nos outros casos, `/` continua no App Router como antes. Um cookie vencido ainda recebe o login atual dentro de `workspace.tsx`.

**Mesma tela.** Cópia, imagens da marca, metadados e chaves do `sessionStorage` ficam em `lib/entry-content.ts`, usado pelas duas entradas. O HTML embute os mesmos `style.css`, `fonts.css`, `brand-symbol.css` e `entry.css`, importados como texto pela regra `*.css?text` do Turbopack em `next.config.mjs`. Um script inline repete o ramo sem sessão e o envio do formulário de `workspace.tsx`. Ele escolhe a chave `guest` ou `anonymous`, mostra o rascunho preservado e grava rascunho e reivindicação antes do POST para `/auth/sign-in`. Se gravar falhar e houver rascunho, ele bloqueia o envio e mostra o alerta. O erro `?login=erro` vem renderizado do servidor, sem refletir a query. A resposta usa `Cache-Control: private, no-store` e `Vary: Cookie`; o app não define outros headers de segurança para `/`.

**Gate.** `scripts/quality/performance.mjs` aceita uma entrada sem script externo quando o HTML tem `main.compor-entry` e o formulário que posta em `/auth/sign-in`. Todo script presente continua tendo de ser um chunk local em `/_next/static`. Orçamentos, configuração do Lighthouse e número de execuções não mudam. O gate passa a medir a primeira visita real. O JavaScript inicial dessa visita é zero, e o limite total continua somando todos os chunks de `.next/static`, inclusive o App Router carregado depois do login. O estúdio depois do login continua fora do Lighthouse, como antes.

Esta decisão substitui, nos [gates](../quality/gates.md), a recusa de uma entrada sem JavaScript ("The entry did not contain any JavaScript to measure") e, no [mapa da arquitetura](../architecture.md), a descrição de que toda visita a `/` passa por `workspace.tsx`.

Medições locais em 09/11/2026, macOS com benchmarkIndex de cerca de 2.800, cinco execuções de `npm run quality:performance` por build:

| Build | JS inicial gzip | JS total gzip | TBT mediano | LCP mediano | CLS mediano |
| --- | --- | --- | --- | --- | --- |
| Antes (`bb67142`) | 179.168 | 294.602 | 24,5 ms (23,5 a 48) | 907 ms | 0,025 |
| Depois | 0 | 294.787 | 0 ms (0 a 0) | 626 ms (611 a 651) | 0,008 |

A 4× e a 5,6× de CPU, em seis execuções intercaladas por lado, a entrada antiga teve tarefas de 80 a 143 ms. A nova teve TBT zero em todas.

## Limites

O limite de JavaScript inicial deixa de cobrir os cerca de 179 KB gzip do App Router que uma pessoa conectada baixa. Só o limite total cobre esse código. Medir `/` com um cookie de sessão sintético preservaria essa cobertura, mas muda o método e fica para decisão de Matheus.

A entrada leve não consulta a sessão ao receber foco, como `workspace.tsx` faz. Quem entrou em outra aba vê o login até recarregar ou clicar em entrar.

A regra `*.css?text` só existe no Turbopack. O teste de navegador compara estrutura e caixas das duas entradas em 390 px com movimento reduzido. Ele não cobre o estado "Verificando sua conta…" nem o login local, que a entrada leve nunca mostra.

Os números acima são locais e não comprovam o CI Linux. A issue #27 ainda exige três execuções seguidas do CI registradas em `docs/quality`. O proxy roda no runtime Node; seu comportamento no deploy da Vercel não foi verificado.
