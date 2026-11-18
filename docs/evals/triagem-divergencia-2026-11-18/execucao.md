# Auditoria dos lotes e da primeira avaliação das imagens

Ensaio de triagem de 2026-11-18. O SQLite registrou 8 lotes, 24 envios de imagem concluídos e 24 arquivos com hashes distintos. Os arquivos de J1 e J2 conferem com os recibos, os prompts e as referências efetivamente entregues em cada braço. O controle de prompt fixo teve zero reservas de imagem.

## Horários do executor

Os horários UTC correspondem à admissão do lote e à confirmação local da última das três imagens. A dispersão usa os horários de reserva de cada operação, imediatamente antes do envio ao provedor. O intervalo vai da conclusão do lote anterior à admissão do próximo. O SQLite não observa a fila interna do provedor nem o momento da apresentação no navegador.

| Lote | Caso | Braço | Origem | Início UTC | Fim UTC | Duração | Dispersão das 3 reservas | Intervalo anterior |
| ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | dev-feira | Com a opcional | J1 | 18:26:11.288 | 18:26:21.468 | 10,180 s | 5 ms | — |
| 2 | dev-feira | Sem a opcional | J1 | 18:26:36.470 | 18:26:44.985 | 8,515 s | 8 ms | 15,002 s |
| 3 | dev-troca | Com a opcional | J1 | 18:26:59.986 | 18:27:07.276 | 7,290 s | 4 ms | 15,001 s |
| 4 | dev-troca | Sem a opcional | J1 | 18:27:22.277 | 18:27:31.151 | 8,874 s | 3 ms | 15,001 s |
| 5 | reserva-cais | Com a opcional | J1 | 18:27:46.152 | 18:28:02.729 | 16,577 s | 5 ms | 15,001 s |
| 6 | reserva-cais | Sem a opcional | J1 | 18:28:17.730 | 18:28:29.127 | 11,397 s | 3 ms | 15,001 s |
| 7 | reserva-sementes | Com a opcional | J1 | 18:28:44.129 | 18:28:53.569 | 9,440 s | 1 ms | 15,002 s |
| 8 | reserva-sementes | Sem a opcional | J1 | 18:29:08.570 | 18:29:16.537 | 7,967 s | 4 ms | 15,001 s |

Nos 7 intervalos entre lotes, 7 atingiram 15 segundos. O menor foi 15,001 s. A maior dispersão entre reservas do mesmo lote foi 8 ms.

## União de J1 e J2

A unidade é uma imagem paga por rodada, caso, braço e posição, confirmada pelo SHA-256. Para arquivos que J1 já tinha gerado, vale o primeiro julgamento de J1. Para arquivos gerados apenas na rodada complementar, vale o de J2. Uma releitura dos mesmos pixels pode alterar a nota. Esses pareceres ficam registrados separadamente.

| Braço | Primeira leitura J1 | Primeira leitura J2 | Exclusivas J1 | Relidas por J2 | Mudaram de avaliação de uso |
| --- | ---: | ---: | ---: | ---: | ---: |
| Com a opcional | 12 | 0 | 0 | 12 | 1 |
| Sem a opcional | 12 | 0 | 0 | 12 | 1 |

## Custo estimado em USD por arte utilizável

O numerador usa os intervalos de custo por operação de R5 no arquivo de uso conciliado. O total do braço inclui seus cinco planos independentes e todas as suas imagens pagas. Os mesmos prompts aprovados no braço com a opcional foram usados nos dois braços da ablação. O denominador é o número de artes utilizáveis após a primeira avaliação. A fatura e a preferência humana permanecem desconhecidas.

| Braço | Imagens | Utilizáveis | Inutilizáveis | Sem decisão | Imagens USD | Cinco planos USD | Planos e imagens USD | Imagens por utilizável USD | Planos e imagens por utilizável USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Com a opcional | 12 | 7 | 5 | 0 | $0.507148–$0.524511 | $0.074558–$0.111545 | $0.581706–$0.636056 | $0.072450–$0.074930 | $0.083101–$0.090865 |
| Sem a opcional | 12 | 7 | 5 | 0 | $0.378838–$0.394311 | $0.049008–$0.057419 | $0.427846–$0.451730 | $0.054120–$0.056330 | $0.061121–$0.064533 |

## Comparação com o resumo J2

| Braço | Imagens julgadas por J2 | Utilizáveis em J2 | Imagens no primeiro julgamento | Utilizáveis no primeiro julgamento | Imagens por utilizável em J2 USD | Planos e imagens por utilizável em J2 USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Com a opcional | 12 | 8 | 12 | 7 | $0.063393–$0.065564 | $0.072713–$0.079507 |
| Sem a opcional | 12 | 8 | 12 | 7 | $0.047355–$0.049289 | $0.053481–$0.056466 |

Com a opcional teve 8 utilizáveis em 12 imagens no resumo J2 e 7 em 12 no primeiro julgamento. A releitura mudou reserva-sementes, posição 1 (false → true).

Sem a opcional teve 8 utilizáveis em 12 imagens no resumo J2 e 7 em 12 no primeiro julgamento. A releitura mudou reserva-sementes, posição 3 (false → true).

O custo bruto por braço confere com o resumo J2 e com as operações do SQLite. As diferenças nas razões por utilizável acompanham o conjunto de imagens ou o parecer adotado.

Fontes locais de verificação. SHA-256 de medidas.json `8b9b385d3b6243663380b3bd561301cbb145fa54afec8da2a2e16f1e85cfa442`. SHA-256 do uso de R5 `c539c3913bc5e339b3f2763661b966aaf6e193ea4bdb4511d8f95335a84fda21`.
