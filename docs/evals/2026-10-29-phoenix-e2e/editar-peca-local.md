# Editar texto do piloto sem refazer a imagem

Esta é uma ferramenta local de experimento, separada do MCP e do produto; **não prova usabilidade de edição para pessoas reais**. A base PNG, o título e os demais textos são elementos distintos. O compositor não regenera a imagem. Ele compara o SHA-256 da base com o manifesto e bloqueia a saída se a base mudou; não sobrescreve um SVG ou PNG existente.

1. Faça uma cópia de `peca-editavel-manifesto.json`, dando à cópia um nome de versão novo.
2. Abra a cópia como texto e edite apenas `titulo_linhas`, `subtitulo`, `rotulo_trabalho` ou `rotulo_pessoal`. O título pode ter de uma a três linhas. Não altere `base` nem `base_sha256`. Salve o JSON em UTF-8.
3. Na raiz do repositório, use nomes de arquivos que ainda não existam:

```sh
NODE_PATH=/Users/matheusborges/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
node prototypes/compor-mcp/scripts/evals/compose-phoenix-creative.mjs \
  CAMINHO-DO-MANIFESTO.json NOVA-SAIDA.svg NOVA-PREVIA.png
```

O SVG não depende do Sharp. A prévia PNG opcional requer o módulo Sharp do runtime local, disponibilizado por `NODE_PATH`; sem ele, omita o terceiro argumento para criar somente o SVG. A prévia deve medir 1122×1402. O programa retorna os hashes da imagem e do manifesto, sem revelar nem solicitar base64. Os limites de caracteres reduzem entradas impróprias, mas não garantem que o texto caiba; revise a prévia e os recortes do canal antes de exportar ou publicar.

Para verificar o contrato de preservação da base, textos e prevenção de sobrescrita:

```sh
node --test prototypes/compor-mcp/scripts/evals/compose-phoenix-creative.test.mjs
```

O teste altera um manifesto fictício, confere a igualdade dos bytes da base, verifica que texto não alterado permanece igual e que XML é escapado. Resultados são arquivos locais de teste, não uma aprovação da peça ou prova de operação do editor no produto.
