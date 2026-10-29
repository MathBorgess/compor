# Verificação pontual de RSS de boards e feeds

Em 29/10/2026, por volta de 11:54 em Recife, após a redescoberta real registrada no arquivo temporário `/var/folders/c6/6xxjr4gn7f9fvxxjmt2xl3mw0000gn/T/compor-decision-mcp-T1vQgU/event-01.json`, consultamos os endereços públicos de três boards solicitados e os feeds das mesmas contas. É uma inspeção posterior e independente; não foi instrumentada a requisição de origem da própria descoberta.

Para cada board, `curl -sSIL` retornou HTTP 200 e não mostrou cabeçalho `Location`. Com `curl -sSL` e User-Agent genérico, obtivemos XMLs e lemos `channel/title`, `channel/link` e os `item/link` em Python. Os arquivos brutos ficam em `/tmp/compor-rss-scope.OVKa9S2p` e podem ser apagados pelo sistema; os hashes abaixo identificam os bytes observados, mas não preservam sozinhos esses bytes. Os feeds foram consultados apenas para comparação, não usados como referências apresentadas nessa verificação.

| Endpoint RSS | Título observado | Link do canal | Itens | SHA-256 dos bytes |
|---|---|---|---:|---|
| `behance/illustration.rss` | Illustration | `https://www.pinterest.com/behance/illustration` | 26 | `ca23208de61b2ffbe32d2f067bcec8d1d4f16e20670d5bdc79c777cd953ef1d5` |
| `behance/feed.rss` | Behance | `https://www.pinterest.com/behance/` | 25 | `b00ca8c4cc36c254f38a395585a1e17e729642430e9f76cf4249bd08ea6dedfc` |
| `latermedia/instagram-post-design.rss` | Instagram Post Design | `https://www.pinterest.com/latermedia/instagram-post-design` | 25 | `8f607cf86fa1a661b45d16d7067ebedbb0bd8a6122cee96111c5b7d2168e0534` |
| `latermedia/feed.rss` | Later | `https://www.pinterest.com/latermedia/` | 24 | `64fe53ce1fe4a48fc86d7f0a209bec4a0c9483663be62a7fd30df8bb40d146c8` |
| `creativemarket/social-media-templates.rss` | ✏ Social Media Templates | `https://www.pinterest.com/creativemarket/social-media-templates` | 26 | `c5c3987113a8a160b62c26a49a1c1a95c61f72f4cad86a6193ee7f2a3cb71134` |
| `creativemarket/feed.rss` | Creative Market | `https://www.pinterest.com/creativemarket/` | 25 | `18ba6f4b9550369247614d762481c64f12283fb45ae708843f5f840cb2e6c0ce` |

Os títulos e links dos canais de board diferem dos feeds de conta; não observamos redirecionamento nos HEADs desses três boards. Os sete candidatos visíveis no arquivo da redescoberta foram encontrados pelo URL exato entre os `item/link` do seguinte RSS consultado posteriormente:

| Candidato | RSS em que seu URL apareceu |
|---|---|
| `phx_17dca0cf_01` | `behance/illustration.rss` |
| `phx_17dca0cf_04`, `phx_17dca0cf_05`, `phx_17dca0cf_06` | `latermedia/instagram-post-design.rss` |
| `phx_17dca0cf_07`, `phx_17dca0cf_08`, `phx_17dca0cf_09` | `creativemarket/social-media-templates.rss` |

Os dois candidatos filtrados não aparecem na lista de prévias do evento e não foram verificados por essa comparação. O conteúdo de um RSS é uma declaração do serviço no momento da consulta; não prova autoria original, direitos de uso, independência das coleções ou a rota efetivamente usada na chamada anterior. URLs e listas podem mudar. A comparação não mede a qualidade das referências nem comprova preferências de pessoas. Nenhuma imagem integral foi copiada para este registro.
