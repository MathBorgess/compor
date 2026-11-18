# ADR 0068 — Estúdio em Pages Router

**Estado aceito em 18/11/2026.** Após a validação da bancada, Matheus autorizou integrar o estúdio à main e publicá-lo pelo fluxo Git da Vercel.

A revisão de partida `bb2bf1b` emite 322.930 bytes gzip de JavaScript para o navegador no Mac do teste. O orçamento é 300.000 bytes. A interface usa uma página do Next e controla projeto e post pela History API. O primeiro build de Pages Router com a interface completa e as 46 entradas HTTP mediu 272.781 bytes. Rodar os dois roteadores no mesmo build somou 440.732 bytes. A medição inclui todo o JavaScript estático e assíncrono. O build oficial do App emite um arquivo de compatibilidade `nomodule` de 39.473 bytes gzip. O build oficial Pages com Turbopack não emite esse arquivo. Ele explica 39.473 dos 50.149 bytes de diferença; os demais arquivos explicam 10.676 bytes líquidos. Os alvos de navegador, as dependências e o cálculo do gate foram preservados. Compatibilidade efetiva depende de verificações nos navegadores.

```text
Navegador ou cliente MCP
    │  URL, método, query e corpo HTTP
    ├─ / ou /projetos/... → proxy de entrada e página do estúdio
    └─ uma das 46 URLs públicas
        └─ Pages API → adaptador Request/Response → implementação em handlers/
                           │                          ├─ autenticação Supabase por pedido
                           │                          ├─ regras de projeto, consentimento e flags
                           │                          └─ acesso a dados com o token da pessoa e RLS
                           └─ stream, sinal de desconexão e cookies da resposta
```

Cada arquivo de `pages/api` importa uma implementação específica. As URLs públicas de OAuth, autenticação, descoberta e favicon usam rewrites fixos. Requisições externas ao prefixo interno recebem 404 no proxy. O teste de inventário confere cada URL, unicidade, número de entradas e `maxDuration`. As dez durações explícitas, de 15, 120 e 300 segundos, também constam do manifesto de produção. O workflow de produção verifica as migrations antes da atribuição do domínio na Vercel.

O adaptador usa o corpo cru da requisição Node como stream Web. Se a conexão chegar interrompida, entrega ao handler o sinal já abortado e omite o corpo. Os limites das operações permanecem nos handlers. Encerrar a leitura do corpo permite que um handler ainda envie sua recusa. A escrita da resposta acompanha a capacidade do cliente, e o fechamento prematuro da conexão aborta o sinal entregue ao handler. HEAD e OPTIONS automáticos seguem os métodos exportados por cada implementação. O parâmetro de rota vem do caminho, preservando à parte os valores repetidos da query.

As leituras e mutações de cookies usam um escopo de `AsyncLocalStorage` por requisição. A resposta preserva as linhas de cookies múltiplos e seus atributos, inclusive `Max-Age=0` na remoção dos verificadores PKCE e no logout. Um cookie especificado pelo handler prevalece sobre uma mutação de jar com o mesmo nome. O roteador não decide a identidade, a existência de projeto, a origem permitida ou o consentimento. O cliente Supabase e as operações de domínio continuam responsáveis por essas verificações. As chaves e os dados privados do estúdio permanecem nos limites anteriores.

A página inicial sem sessão continua sendo servida em HTML pelo proxy. A página autenticada recebe apenas a configuração pública de disponibilidade. Os componentes e folhas de estilo ficam em `studio/`; `pages/_app.tsx` importa o CSS global. A linguagem e os metadados do documento são definidos em Pages. Os gates finais mediram 272.750 B de JS, com 693/693 casos da suíte web aprovados. A jornada com serviços simulados passou em Chromium, Firefox e WebKit. [Resultados e limites](../quality/2026-11-18-prototipo-pages-router.md)
