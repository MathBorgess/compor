# Reformulação de usabilidade — evidência local de 15/11/2026

## Escopo

Implementação na branch `feat/frontend-usability`, a partir de `513e966`. Decisões nos ADRs [0044](../adr/0044-preparacao-guiada-e-estudio-por-post.md) e [0045](../adr/0045-conversas-isoladas-por-post.md). Código de produto em `a02c11f`, `aa5e7f3` e `57a579e`, com ajustes finais registrados no histórico da branch. Nenhum push, PR, deploy ou migration remota foi executado.

Ambiente: Windows, Node 24.13.0, Next 16.4.4, Chromium 156.0.8078.4 e Python 3.13.6. Provedores simulados; não foram usadas credenciais reais nem chamadas pagas.

## Comportamento

- Criação distingue ideia do projeto e pedido de post. Enter, composição, toque e prevenção de duplicação são exercitados.
- Preparação preserva etapa, pergunta e respostas, inclusive texto apagado; recarga não gera imagens.
- Escolha de IA não inicia imagens. A fonte do Compor não envia chave ao navegador; BYOK permanece em memória e não usa fallback. A exploração exige pedido explícito.
- Referências mantêm consentimento, origem e escolha humana. Lotes, espera, perguntas pendentes e resultado desconhecido conservam suas proteções.
- Posts compartilham contexto e separam conversa, compositor, versões e continuidade assinada. Pedidos atrasados conservam a origem. Dois posts e reload são exercitados no navegador.
- Migração IndexedDB preserva o original e blobs; quota aborta a transação inteira e clientes antigos não sobrescrevem o banco convertido.
- Histórico anterior permite consultar uma pendência, sem executar ferramentas ou gerar imagens. O teste usa o componente real com respostas que exigiriam essas ações.
- Divisão do estúdio responde a teclado e ponteiro. Alternância compacta e retorno das configurações preservam trabalho. Arte integral, aprovação, variantes, legenda, PNG e conversão de JPEG são verificados separadamente.

## Checks

| Check | Resultado local |
| --- | --- |
| `quality:lint` | Aprovado, sem avisos |
| `quality:typecheck` | Aprovado, tipos estritos |
| `quality:test` | 23/23 aprovados |
| `quality:browser` | 397/397 aprovados, zero falhas e zero skips |
| Vínculo de conversa focado | 57/57 aprovados |
| Estado e workflow focados | 25/25 aprovados |
| Build Next de produção | Aprovado em cópia isolada: `npm run build` em `apps/web`, o comando chamado por `quality:build` |
| Site Astro | `check`: 17 arquivos, sem erros/avisos; build e validação de `dist` aprovados |
| `quality:performance` | Aprovado em cinco execuções na cópia de produção |
| `quality:unit` | Não aprovado; limitações detalhadas abaixo |

O site foi verificado com Git Bash como `npm_config_script_shell` no Windows, mantendo scripts e lockfiles. O Chromium obrigatório foi configurado por variável de ambiente privada. A suíte web completa usa fontes físicas isoladas; não reconstrói o `.next` da revisão.

A suíte completa terminou antes dos últimos ajustes pontuais de orientação e edição do objetivo nas configurações. Depois deles, a revisão final no Next real/Chromium exercitou criação, dois posts, compositor preservado, compacto, alteração/retomada do objetivo, lote explícito de três referências, escolha de imagem e editor sem IA, sem erros de página. Lint, tipos e build foram executados novamente sobre o código final `9d14ad1`. O MCP do Next também retornou `issues: []`; não se afirma execução da skill next-dev-loop, cujo pré-requisito global não foi instalado.

## Bundle e performance

Capturas completas do `next analyze` antes/depois: `usability-before-513e966`, `usability-after` e `usability-final`, exportadas com gzip e pipeline verificado. A análise seguiu `next-bundle-optimizer`. Atribuições por fonte/arquivo foram deduplicadas entre rotas; não são medidas de transferência. O scan incluiu módulos concatenados por atribuição: credenciais em memória, leitura pública da sessão, consentimento da aba, fetch de imagens privadas e contratos puros foram classificados como conteúdo intencional de cliente. Os demais matches eram runtime/shims do Next; nenhum achado de possível conteúdo exclusivo de servidor nos módulos inspecionados. Não há Server Action própria importada pelo cliente. Seis saídas `not_a_chunk` não enumeram membros e limitam essa conclusão. O relatório detalhado e os exports permanecem como artefatos privados da revisão.

Medição do build final `9d14ad1`, sem browser tests concorrentes:

| Medida | Resultado | Limite |
| --- | ---: | ---: |
| JavaScript inicial gzip da entrada sem sessão | 0 bytes | 250.000 bytes |
| JavaScript total de cliente gzip | 299.726 bytes | 300.000 bytes |
| LCP mediano, cinco execuções | 649,9 ms | 2.500 ms |
| TBT mediano | 0 ms | 200 ms |
| CLS mediano | 0,0080 | 0,1 |

O orçamento total tem margem de 274 bytes; alterações futuras precisam manter a medição. O proxy entrega a entrada sem sessão sem JavaScript. Lighthouse não mede startup autenticado, latência de geração ou qualidade do post; nenhuma economia de rede é deduzida das atribuições do analisador.

O diagnóstico de manutenção é informativo: registrou funções acima de complexidade 20 e não é tratado como gate arquitetural ou prova de cobertura.

## Limitações dos checks legados no Windows

`quality:unit` foi executado e **não passou**. Os pacotes Agents API (186), Agile Deliberation (29), métricas (9) e Images API (11) passaram. Em `private-images`, passaram 32 de 46; 11 falharam e os três testes de psql já condicionais no repositório foram pulados por ausência da ferramenta. Os testes que falham continuam usando caminhos de URL como caminho nativo, diretórios POSIX e wrappers de shell. Nenhuma dessas asserções ou condições foi removida.

Os checks seguintes foram executados separadamente, pois o agregado para na primeira falha: `remote-mcp` passou 27/27; o protótipo stdio passou 94/140 e falhou 46 no Windows, incluindo guardas de diretório/staging, persistência e ferramentas de imagem. Os testes Python passaram 18/22 após usar um alias privado de `python3` e restaurar os bytes LF: restaram três falhas e um erro em wrappers, checkout e empacotamento. Esses módulos/testes legados não foram reescritos nesta reformulação; as particularidades de plataforma não são apresentadas como aprovação do gate.

Os commits de portabilidade mantêm o Chromium obrigatório e os mesmos testes/limites, executam o npm pelo launcher Node e preservam os bytes LF exigidos por hashes de proveniência e geradores. Não alteram SQL, RLS, reservas ou autorização. O ambiente específico da máquina e os artefatos brutos permanecem privados e excluídos do Git.

## Alcance da evidência

O ambiente de revisão serve o Next real e usa o domínio, IndexedDB e componentes reais, com sessão e fronteiras externas fictícias. A busca externa desse ambiente é vazia; upload e imagens de exemplo permitem avaliar o percurso. Isso não comprova integração real com Pinterest/OpenAI, qualidade criativa, isolamento entre contas reais, CI Linux ou deploy. A avaliação manual da pessoa usuária continua pendente; implementação disponível não significa aprovação visual ou de usabilidade.
