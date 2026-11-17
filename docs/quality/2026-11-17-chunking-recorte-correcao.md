# Agrupamento do bundle no recorte de correções

Em 17/11/2026, o gate de performance no CI Linux mediu **300.483 bytes gzip** de JavaScript cliente, acima do orçamento de 300.000. A medição local do mesmo recorte de código, `0189245`, havia sido 299.792 bytes. O ajuste configura os limites de agrupamento de chunks do Turbopack no Next 16.4.6; não altera o orçamento, a versão do framework ou o polyfill. A comparação usa Node `v24.16.0` em macOS arm64; o novo valor no CI precisa ser verificado separadamente.

## Resultado local

| Medida | Agrupamento padrão | Agrupamento ajustado |
| --- | ---: | ---: |
| `totalClientJavascriptGzipBytes`, todos os `.js` emitidos em `.next/static` | 299.792 | 297.608 |
| Lighthouse: mediana LCP da entrada sem sessão | 625,8 ms | 623,9 ms |
| Lighthouse: mediana TBT da entrada sem sessão | 0 ms | 0 ms |
| Lighthouse: mediana CLS da entrada sem sessão | 0,0080 | 0,0080 |

`quality:performance` passou localmente com cinco execuções Lighthouse em cada caso. Essas medições são locais, com entrada sem sessão e configuração sintética; não demonstram tempos de produção nem validam operações externas.

Para observar o carregamento autenticado, uma execução Chromium usou o build de produção, cookie sintético, sessão e APIs simuladas e bloqueio de origens externas. Os arquivos JS requisitados foram contados uma vez e seus bytes calculados pelo gzip local dos arquivos emitidos; não são transferência observada na rede nem medição de cache real:

| Cenário | Padrão | Ajustado |
| --- | ---: | ---: |
| Entrada sem sessão | 0 arquivos, 0 bytes | 0 arquivos, 0 bytes |
| Lista de projetos após sessão simulada | 8 arquivos, 259.855 bytes | 5 arquivos, 257.671 bytes |
| Abrir o projeto e iniciar um post | 8 arquivos, 259.855 bytes | 5 arquivos, 257.671 bytes |

O mesmo conjunto de arquivos já havia sido carregado na lista de projetos, antes da abertura do post, nessa reprodução. Isso não comprova o comportamento de outros percursos, condições de rede ou sessões reais.

## Fronteiras, cache e verificações

Os snapshots `release-0189245` e `release-chunking-experiment`, capturados e exportados com `next analyze` sem filtro, cobrem as 37 rotas em cada build. Para cada grupo com trigger associado, a comparação das identidades dos módulos e async loaders nas saídas cliente indexadas não encontrou inclusão ou exclusão. A fronteira assíncrona do estúdio permaneceu no grafo. Os dois outputs de runtime/polyfill com cobertura `not_a_chunk` não permitem enumerar seus membros internos; a igualdade das identidades indexadas não comprova todos os requests futuros nem todos os comportamentos do aplicativo.

O ajuste agrupa três chunks bootstrap em um arquivo de aproximadamente 125,5 KiB gzip. Em uma mudança sintética e reversível de texto em `workspace.tsx`, a reconstrução alterou um chunk de **5.828 bytes** no padrão e um de **5.815 bytes** com a configuração; os demais nomes de arquivos JS permaneceram reutilizáveis nesse experimento. Em uma atualização futura que altere somente parte do chunk bootstrap combinado, mais bytes podem ser invalidados no cache do que antes. Esse trade-off não foi medido em atualização real de framework e não é eliminado pelo teste sintético.

Um teste Chromium executou a jornada de projeto, conversa, marcações, upload e exportação com `next start` e serviços simulados. A mesma jornada, dois testes de pausa/troca de IA durante uma solicitação pendente e o teste de ciclo de vida de URL passaram em execução de desenvolvimento: cinco testes no total, sem chamadas pagas. A comparação do analyzer, o teste de cache e essas jornadas não substituem a suíte completa ou o gate Linux.

As capturas exportadas desta execução ficaram em `/tmp/compor-release-0189245-analyze.jsonl.gz` e `/tmp/compor-release-chunking-experiment.jsonl.gz`; são arquivos temporários da máquina, não artefatos versionados. Para reproduzir, execute `next analyze --output --snapshot <nome>` e `next analyze export --snapshot <nome>` em cada build, e compare outputs, módulos, grupos e suas coberturas antes de inferir a mudança de carregamento.
