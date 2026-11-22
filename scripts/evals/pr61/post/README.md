# Avaliação visual dos posts do PR 61

O marco 5 julga a arte de cada uma das três propostas. O grupo atual inclui três briefings sintéticos de desenvolvimento e dois reservados. A rubrica permanece fixa nas quatro rodadas. O pacote do juiz contém somente briefing, fatos, regras de texto e pixels. Os nomes de casos, slots, revisões, divisões e resultados anteriores ficam fora da sessão. A permutação é reproduzível pelo hash dos casos e índice da rodada.

Requer Python 3.10 ou superior, Pillow e Codex CLI autenticado via ChatGPT (`codex login status`). A bancada usou Python 3.12.1, Pillow 12.2.0 e Codex CLI 0.166.0. As artes precisam existir previamente na bancada. O juiz usa os anexos em uma nova sessão efêmera do Codex e não chama o Agents API nem o GPT Image. Conserve arquivos e recibos da experiência fora do Git. Os caminhos abaixo representam um diretório local privado.

```sh
python3 scripts/evals/pr61/post/judge.py "$bancada" 0
```

Execute uma vez por rodada após `round-N/complete.json`, alterando o índice de 0 até 3. O verificador confere o SHA-256 dos PNGs contra os recibos. Cada arquivo avaliado aparece em duas escalas. O painel usa 360 px de largura por proposta para pontuar leitura. O original saneado serve para conferir fatos e grafia. Ambos mostram os pixels sobre fundo branco. A renderização interna dos anexos fica a cargo do modelo. Um slot com bytes indisponíveis ou divergentes do recibo aparece expressamente como sem pixels. O juiz devolve evidências por dimensão e os estados dos fatos. O script calcula localmente quantas artes passam a regra de 2/2/2 e fidelidade factual e recusa resultados sem evidência ou inventário completo. Uma falha na sessão do juiz ou na validação da sua resposta interrompe a publicação. Se uma rodada terminar com falha de execução conhecida e sem imagem para algum caso, registre `incompleteCases` no manifesto, com `id`, `stage`, `state` e `slots`. O pacote mantém o caso, o juiz se abstém onde faltarem pixels e o relatório documenta a interrupção.

`round-N/judge-5.json` contém exclusivamente evidência e feedback dos casos de desenvolvimento, publicados atomicamente. `juiz-visual-retido/` contém o mapa dos IDs, os anexos, a saída integral da sessão e a avaliação de reserva. Preserve esse diretório fora do alcance do autor das candidatas até fechar as quatro rodadas. Há um único escritor para cada rodada. O script recusa substituir um resultado publicado.

```sh
python3 scripts/evals/pr61/post/report.py "$bancada"
```

O relatório combinado exige as quatro rodadas completas, resultados correspondentes e versões idênticas de casos e rubrica. A unidade de comparação é a arte disponível. O marcador de prontidão é um proxy restrito à peça visual. O relatório identifica pixels ausentes e o grupo reservado tem apenas dois casos. O ensaio não confirma desejo humano de publicar, qualidade da legenda, preservação de versão ou efeito sobre uma população de criadores.

## Suíte estendida (`--suite extended`)

Para avaliar as skills criativas curadas, a skill dedicada de `copy-na-imagem` (`on-image-copy.v1`), o perfil de voz (`brandVoice`) e os quatro modos nativos do Instagram (`single` 4:5, `carousel` 4:5, `collection` 4:5 e `story` 9:16), a bancada inclui uma suíte aditiva que preserva integralmente a suíte legada (`--suite legacy`, padrão):

- **Casos sintéticos:** `casos-estendidos.json` (8 casos: 5 em `desenvolvimento` e 3 em `reserva`, cobrindo os 4 formatos, fatos confirmados e restrições `brandVoice.avoid`).
- **Rubrica estendida:** `rubrica-estendida.md` (dimensões universais `gancho`, `adequacaoAoPerfil`, `leitura`, `adequacao` e `sinergiaLegenda` quando `caption.txt` estiver presente; condicionais `coesaoVisual` e `progressaoOuRitmo` para carrossel/coleção; `zonasSeguras` para story 9:16 com painel comparativo 360 px limpo + guia 15%/25%/16%).
- **Portão crítico de voz e fatos:** além de `omissao`, `alteracao`, `inventado` e `texto_proibido`, registra `cliche_ou_evitar` quando a arte ou a legenda viola `brandVoice.avoid` ou usa clichês proibidos. Qualquer lâmina ausente em carrossel/coleção mantém o caso como `sem_pixels`.

```sh
# 1. Gerar rodada 0 (baseline) e rodada 1 (candidata) com chave em memória via clipboard (macOS) ou --key-stdin:
node scripts/evals/pr61/post/run-extended.mjs --root "$bancada" --round 0 --arm baseline --confirm-paid-run
node scripts/evals/pr61/post/run-extended.mjs --root "$bancada" --round 1 --arm candidate --confirm-paid-run

# 2. Julgar e consolidar relatório (Codex autenticado via ChatGPT, sem API key):
python3 scripts/evals/pr61/post/judge.py "$bancada" 0 --suite extended
python3 scripts/evals/pr61/post/judge.py "$bancada" 1 --suite extended
python3 scripts/evals/pr61/post/report.py "$bancada" --suite extended --rounds 2
```

O teste unitário offline do executor (`node --test scripts/evals/pr61/post/run-extended.test.mjs`) valida isolamento de diretório privado, injeção de skills/âncora e compatibilidade com `judge.py` sem credenciais. Os resultados de desenvolvimento vão atomicamente para `round-N/judge-5-extended.json` e os reservados ficam retidos em `juiz-visual-retido/extended-round-N.json` até o fechamento das rodadas comparadas (`juiz-visual-estendido.md` e `juiz-visual-estendido.json`). A execução real com provedor pago continua exigindo autorização explícita.
