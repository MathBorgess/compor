# Compor em Pages Router com as 46 entradas HTTP

Em 18/11/2026, o build local da revisão `2887630` entregou o cliente completo em **272.750 B gzip**, 27.250 B abaixo do teto de 300.000 B. A base `bb2bf1b` usava App Router. As medidas somam o gzip de cada JavaScript de `.next/static`, incluindo os chunks que a entrada pública não carrega. As condições de aplicação dos gates e seus orçamentos continuam iguais. [ADR 0068](../adr/0068-prototipo-pages-router-com-paridade-http.md)

## Custo do cliente

| Build Next 16.4.6 / Turbopack | JavaScript estático total gzip | Observação |
| --- | ---: | --- |
| App Router na base | 322.930 B | 46 Route Handlers |
| Páginas e pasta residual `app` | 440.732 B | Controle com os dois roteadores presentes |
| Primeiro protótipo Pages com interface completa | 272.781 B | 14 JS. O pacote de staging equivalente mediu 272.797 B |
| Protótipo Pages após correções de transporte, cookies e rascunho | 272.750 B | 14 JS e 46 entradas Pages API |
| Pacote do mesmo commit para staging, instalado do lockfile offline | 272.767 B | 14 JS, 46 entradas e compilação de produção local |

O App emitia um `nomodule` de 39.473 B gzip. O Pages/Turbopack omitiu esse arquivo na configuração de produção. Dos 50.149 B da redução inicial, 39.473 B vêm do arquivo e 10.676 B dos demais em conjunto. A revisão final economizou mais 31 B. A redução líquida final foi **50.180 B**. As dependências, os alvos de navegador e os polyfills configurados continuam os da base. Os ensaios de compatibilidade cobriram versões atuais de três motores.

| HTML e recursos vinculados pelo documento | App | Pages final |
| --- | ---: | ---: |
| Sem sessão, HTML gzip | 3.740 B | 3.740 B |
| JS na entrada pública | 0 B | 0 B |
| HTML do estúdio com cookie sintético | 2.357 B | 1.196 B |
| JS ligado pelo HTML do estúdio | 190.021 B | 135.094 B |
| CSS ligado pelo HTML do estúdio | 9.936 B | 17.011 B |
| Total ligado pelo HTML do estúdio | 202.314 B | 153.301 B |

O analyzer selecionou 49 rotas no App e 47 em Pages, que incluem a página do produto e as 46 APIs. O grafo atribuiu seis saídas JS do Pages exatamente. Uma saída de runtime e duas sem enumeração de membros limitam a atribuição de dependências. Os caminhos de cliente atribuídos não contêm os handlers, o adaptador de cookies ou os SDKs de Supabase e OpenAI. O gate mediu todos os arquivos JS diretamente em disco.

## Contratos HTTP e jornadas

- A matriz de produção local comparou 206 casos em `127.0.0.1` e 206 em `localhost`. Nas duas origens, status, corpo e cabeçalhos comparados coincidiram para as 46 URLs públicas. Oito aliases e uma página ausente responderam 404. Foram exercitados HEAD, OPTIONS, Allow, parâmetros dinâmicos, query repetida, listas privadas de dois usuários sintéticos concorrentes e login PKCE com quatro cookies.
- O complemento encontrou três divergências de expiração de cookies. A reconstrução de cabeçalhos eliminava `Max-Age=0` na remoção do verificador ou no logout. A correção conserva cada linha `Set-Cookie` e a precedência do handler. O reteste passou nos 13 casos, inclusive callback das duas identidades, isolamento durante rotação da sessão, logout e upload no limite de 8 MiB. A diferença máxima de duração relativa foi de um segundo.
- Os testes do adaptador exercitaram um POST já desconectado com e sem erro de transporte, a desconexão posterior antes do envio, o primeiro evento SSE de uma conexão ainda aberta, cancelamento, limite do leitor e conexão reutilizada depois de uma recusa. Uma conexão interrompida entrega o sinal abortado ao handler. Quando já chega interrompida, ele recebe o corpo ausente e o motivo. Os três cenários de interrupção somaram zero envios no contador sintético.
- A jornada em `next start` restaurou a versão 1 de uma arte a partir da versão 2, verificou o texto no editor e acompanhou o primeiro recibo atualizar o lote de 0/3 para 1/3, com os indicadores pendentes passando de três para dois. Chromium 157, Firefox 157 e WebKit 27.2 passaram com serviços sintéticos, sem chamadas a hosts externos. Um teste complementar de rascunho confirmou o valor em sessionStorage antes e depois de recarregar e na primeira exibição do compositor do post correto.
- Quarenta e quatro implementações de handler mantêm conteúdo idêntico por SHA-256. Em `auth/sign-in` e `auth/callback`, a única alteração no corpo do arquivo foi o caminho do import de cookies. Os manifestos de build preservam dez limites de duração explícitos, de 15, 120 ou 300 segundos. As demais 36 entradas usam o padrão.

## Gates locais

| Gate | Resultado |
| --- | --- |
| ESLint, TypeScript e build de produção Next | Aprovados |
| Unidades de pacotes e scripts | 524 Node + 22 Python aprovados |
| Verificação dos avaliadores, Goals e infraestrutura simulada | 109 aprovados |
| Suíte web com Chromium obrigatório | 693/693 aprovados, zero skips, em 553,6 s |
| Astro check e build | 17 arquivos, zero erros ou avisos, saída estática validada |
| Lighthouse da entrada pública | Cinco execuções, cinco orçamentos respeitados |
| Manutenibilidade | 302 arquivos analisados. 121 funções acima de 20 receberam diagnóstico |

| Mediana da entrada sem sessão | Medida | Orçamento |
| --- | ---: | ---: |
| LCP | 623,6 ms | 2.500 ms |
| TBT | 0 ms | 200 ms |
| CLS | 0,0080 | 0,1 |

A máquina usou Node 24.16.0 e Chromium 157 no macOS. A execução de produção da Vercel, o CI Linux, navegadores históricos, a latência de geração de imagem e o uso com identidade e provedores reais seguem sem observação neste ensaio. A promoção depende de decisão de Matheus.
