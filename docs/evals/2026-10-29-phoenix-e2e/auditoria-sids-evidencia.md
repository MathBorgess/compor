# Auditoria de SIDs e da ordenação no caso Marina

Registro de 29/10/2026. Os nove itens da busca da persona simulada foram pontuados; isso não demonstra que fossem úteis. O designer simulado avaliou os três primeiros como 1, 0 e 1 em escala 0–3, enquanto a persona aproveitou aspectos específicos dos itens 1 e 3. São julgamentos de um caso com critérios diferentes, não rótulos humanos ou evidência suficiente para escolher novos pesos.

## Defeito reproduzido

Na implementação anterior, a classificação determinística escolhia categorias sem evidência por `índice % tamanho da taxonomia`. Assim, trocar a ordem dos mesmos metadados podia mudar mecanismos, hierarquia e estética. No item 04 do [evento original](marina-decision-evidence.json), o texto “Romantic Florist Instagram Template” foi acompanhado de `glassmorphism_ui`, `minimal_whitespace` e `executive_clean_b2b`, categorias não sustentadas por aquele texto e derivadas do índice. O SID também entrava nos embeddings e no prompt do ranker, e podia acionar filtros ou diversidade. A diferença entre as notas do modelo e do designer não prova que esse defeito tenha causado a ordenação ou a baixa utilidade.

A destilação anterior aplicava os mesmos defaults por índice à intenção da pessoa. Além disso, uma busca por substring `ad` podia interpretar partes de palavras como “comunidade” como formato de anúncio. Essas são falhas mecânicas verificáveis, independentes do acerto criativo do modelo.

## Correção e limites

Para candidatos de provedores reais, o código agora extrai apenas rótulos taxonômicos explicitamente presentes nos metadados sanitizados. As dimensões sem evidência usam marcadores `sid_unknown_*`, estáveis sob reordenação; a posição do item, o board solicitado e o formato da peça não inventam atributos da referência. O texto externo continua sendo uma **alegação não verificada**, não análise visual. O gerador explicitamente sintético conserva o mecanismo anterior para seus casos de teste.

Na intenção, categorias ausentes ficam desconhecidas, não entram na consulta nem nos SIDs obrigatórios. Termos catalogados e o roteamento de anúncios usam limites de palavra. Marcadores desconhecidos não entram nos embeddings ou como categorias dos prompts e não são agrupados como se tivessem a mesma estética, evitando uma penalidade de diversidade fabricada. O ranker multi-ação passa a identificar o board como solicitado e a descrição como dado externo não confiável. Não há prova de que essa mudança melhore a relevância.

Se uma exclusão visual estiver ativa e as categorias do item real forem incompletas, o protótipo pontua o item no modo Decision, mas não o exibe nem permite staging: informa que a restrição não foi verificada e mantém a opção de seguir sem referência. Isso pode reduzir ou zerar resultados; é uma consequência explícita enquanto não existe verificação visual suficiente. Uma alegação textual explícita também não é prova independente do conteúdo da imagem; o mecanismo continua exigindo revisão e avaliações humanas.

## Testes

`node --test test/phoenix-sid-evidence.test.mjs test/phoenix-decision-mcp-coverage.test.mjs test/phoenix-decision-score.test.mjs test/phoenix-formulas.test.mjs` passou 26/26: ausência e negação de evidência, rótulos explícitos, ordem de resultados, fronteiras de palavras, diversidade sem cluster inventado e bloqueio conservador com continuação sem referência. São testes controlados, não medição de qualidade com clientes. A alteração mudou o hash do código usado na calibração histórica; os resultados antigos devem permanecer imutáveis e um baseline posterior deve ser registrado separadamente antes de alegar reprodutibilidade da nova revisão.
