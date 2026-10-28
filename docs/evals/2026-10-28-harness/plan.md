# Ondas de avaliação MCP e harness — 28/10/2026

Pedido: iterar ferramentas, simular trajetórias e comparar candidatos; acrescentado pelo usuário: LLM Judge persona Compor deve avaliar encantamento com resultados e variações criativas. Dados sintéticos, sem pesquisa humana, sem promoção automática. Execução base: Codex Desktop macOS, modelo observável do coordenador gpt-6-astra; versões exatas do gerador e eventuais modelos de subagentes serão registradas somente quando observáveis. Base Git 150f065. Nenhuma API com chave própria será chamada.

## Desenho antes das sessões de candidatos

1. Revisão de cobertura S01-S23, C01 e Annotate; reprodução de falhas e preservação baseline das ferramentas. Correções de contrato avaliadas contra os mesmos casos congelados (casos de desenvolvimento, não holdout).
2. Duas sessões independentes de subagentes com contexto inicial vazio, mesmo briefing sintético, mesmas tools corrigidas, e orientações candidatas H0/H1. Cada sessão escolhe as próprias chamadas MCP pelo bridge; entradas/saídas são preservadas. Não entregar expectativas/gabarito à sessão. Consumo de tokens do ambiente existe; não chamar de gratuito.
3. Gerar ativos sem texto a partir das direções propostas, pelo image_gen disponível no ambiente, e compor camadas de texto separadas. Isso testa o pipeline experimental coordenado, não um adaptador de geração do MCP ou a API BYOK do produto. Se geração indisponível, registrar a falha, sem substituir imagem por nota alta de texto.
4. Judge independente recebe briefing e outputs com rótulos neutros, sem nome do candidato. Registra evidências visuais, encantamento 1-5, adequação profissional, diversidade útil, fidelidade e fricção. A ordem e poucos exemplos limitam a comparação; não é teste estatístico ou holdout protegido. Revisor técnico aplica limites separadamente.
5. Se houver falha concreta, uma iteração dirigida cria H2 e é reavaliada, conservando outputs e crítica anteriores. Ajustar ao Judge transforma os casos em desenvolvimento; sem conclusão de generalização.

Hipóteses: H0 = instrução genérica do produto; H1 = mesma base com sequência explícita de entender fatos/hipóteses, carregar skill relevante e preparar planos de camadas/Annotate. Comparar comportamento e resultado, aceitando ordens de tools diferentes. Não atribuir diferenças ao prompt isoladamente: subagentes e imagens são estocásticos, sem seed/temperatura controladas.

Régua experimental proposta antes da avaliação: encantamento 1 (rejeitaria), 2 (muito retrabalho), 3 (útil sem entusiasmo), 4 (usaria com pequenos ajustes), 5 (usaria e gostaria de explorar mais). Evidências específicas obrigatórias; NA se imagem indisponível. Desejo de viralizar não pode ser tratado como probabilidade de viralização. Critério candidato: encantamento >=4 no conjunto, diversidade útil >=4, nenhum fato inventado/restrição explícita violada ou falsa alegação de efeito. É um proxy de preferência simulada, não aceite do usuário.

Somente hipóteses reversíveis em tarefa/campanha; ampliar ao produto depende da confirmação da pessoa (decisão de Matheus hoje). A ferramenta não toma alegação do modelo como autorização. Preservar todos os candidatos, resultados negativos e limitações até revisão humana.
