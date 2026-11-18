# Juiz pareado de pixels

Depois de encerrar ou reconciliar os recibos de uma rodada, prepare o pacote em uma pasta nova. A variável `RUN` aponta para a bancada privada produzida pelo executor. A variável `R` vale de 0 a 5.

```sh
python3 -B scripts/evals/triagem-divergencia/pixels/judge.py prepare "$RUN" "$R" "$RUN/round-$R/pixels"
python3 -B scripts/evals/triagem-divergencia/pixels/judge.py judge "$RUN/round-$R/pixels"
```

São necessários Node, Python com Pillow e, nos grupos com imagens, o Codex CLI autenticado via ChatGPT. O comando de preparação usa o manifesto do par para conferir que os prompts correspondem por posição, o arquivo opcional foi a única diferença entre os conjuntos de entrada e que as configurações e o modelo correspondem nos recibos. Cada arte precisa corresponder aos bytes e SHA-256 do seu recibo. O julgamento ocorre em duas sessões independentes de cinco briefings, com um braço por caso em cada sessão. A ordem dos casos, braços e slots é embaralhada. A sessão recebe os PNGs originais renomeados e a mesma faixa de referências completas nos dois braços. A pasta temporária do juiz tem nome aleatório e contém apenas os estímulos e o schema.

Um campo sem arte/recibo reconciliado fica sem nota. Em `identical_after_triage` o executor registra ausência de intervenção e deixa de disparar ambos os lotes. Esse caso não oferece observação causal nem custo de geração. Uma sessão sem qualquer arte dispensa o juiz e conserva todos os campos como indeterminados. Uma desistência do juiz por evidência insuficiente também produz nota nula.

`judgments.json` une o parecer aos IDs do caso, braço, posição, caminho relativo à pasta da rodada e hash do PNG. Cada arte tem decisão de usabilidade e motivo, falhas críticas localizadas e notas 0–2 com evidência por referência. Cada par tem julgamento de proximidade visual. `attribute-scores.json` apresenta a soma e o denominador por atributo, com cobertura e ausências. `feedback-dev.json` inclui apenas os três casos de desenvolvimento. Abra a reserva após o congelamento da última candidata. A rubrica completa está no [dataset](../dataset/README.md). Custos pertencem ao relatório do ledger.

Os testes locais exercitam lacunas e verificam que braços mascarados ainda pontuam os mesmos atributos. Rode `python3 -B -m unittest discover -s scripts/evals/triagem-divergencia/pixels -p 'test*.py'`.


## Comparação local e escolha voluntária

Quando houver PNGs e recibo de ablação concluído, execute `python3 -B scripts/evals/triagem-divergencia/pixels/gallery.py "$RUN" comparacao.html`. Use um nome novo a cada fotografia da bancada. A página compara os braços da baseline e da rodada 5 com o prompt congelado de cada par, links para o PNG original e identificação dos arquivos. Abra o HTML no mesmo computador, mantendo o diretório da bancada em sua localização original.

Em cada braço com um conjunto completo, o leitor pode escolher uma das três rotas, marcar “Nenhuma” e escrever o motivo. Baixar o JSON é uma ação voluntária e registra somente os grupos em que houve resposta. Fechar a página descarta escolhas ainda não baixadas. Casos retidos ou sem ablação têm seu estado indicado. Quando a bancada ainda não tem nenhum PNG de um par reconciliado, o comando encerra sem emitir uma galeria.
