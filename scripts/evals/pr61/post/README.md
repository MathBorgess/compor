# Avaliação visual dos posts do PR 61

O marco 5 julga a arte de cada uma das três propostas. O grupo atual inclui três briefings sintéticos de desenvolvimento e dois reservados. A rubrica permanece fixa nas quatro rodadas. O pacote do juiz contém somente briefing, fatos, regras de texto e pixels. Os nomes de casos, slots, revisões, divisões e resultados anteriores ficam fora da sessão. A permutação é reproduzível pelo hash dos casos e índice da rodada.

Requer Python 3.10 ou superior, Pillow e Codex CLI autenticado via ChatGPT (`codex login status`). A bancada usou Python 3.12.1, Pillow 12.2.0 e Codex CLI 0.166.0. As artes precisam existir previamente na bancada. O juiz usa os anexos em uma nova sessão efêmera do Codex e não chama o Agents API nem o GPT Image. Conserve arquivos e recibos da experiência fora do Git. Os caminhos abaixo representam um diretório local privado.

```sh
python3 scripts/evals/pr61/post/judge.py "$bancada" 0
```

Execute uma vez por rodada após `round-N/complete.json`, alterando o índice de 0 até 3. O verificador confere o SHA-256 dos PNGs contra os recibos. Cada arquivo avaliado aparece em duas escalas. O painel usa 360 px de largura por proposta para pontuar leitura. O original saneado serve para conferir fatos e grafia. Ambos mostram os pixels sobre fundo branco. A renderização interna dos anexos fica a cargo do modelo. Um slot com bytes indisponíveis ou divergentes do recibo aparece expressamente como sem pixels. O juiz devolve evidências por dimensão e os estados dos fatos. O script calcula localmente quantas artes passam a regra de 2/2/2 e fidelidade factual e recusa resultados sem evidência ou inventário completo. Uma falha na sessão ou na validação interrompe a publicação.

`round-N/judge-5.json` contém exclusivamente evidência e feedback dos casos de desenvolvimento, publicados atomicamente. `juiz-visual-retido/` contém o mapa dos IDs, os anexos, a saída integral da sessão e a avaliação de reserva. Preserve esse diretório fora do alcance do autor das candidatas até fechar as quatro rodadas. Há um único escritor para cada rodada. O script recusa substituir um resultado publicado.

```sh
python3 scripts/evals/pr61/post/report.py "$bancada"
```

O relatório combinado exige as quatro rodadas completas, resultados correspondentes e versões idênticas de casos e rubrica. A unidade de comparação é a arte disponível. O marcador de prontidão é um proxy restrito à peça visual. O relatório identifica pixels ausentes e o grupo reservado tem apenas dois casos. O ensaio não confirma desejo humano de publicar, qualidade da legenda, preservação de versão ou efeito sobre uma população de criadores.
