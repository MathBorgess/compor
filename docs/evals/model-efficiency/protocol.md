# Eficiência do MCP: Terra, Sol e Astra

28/10/2026 · protocolo anterior às trajetórias · estudo sintético para revisão de Matheus.

Pedido: partir do PR #8 em uma nova branch/PR, comparar o processo completo com `gpt-6.1-terra`, `gpt-6.1-sol` e `gpt-6-astra`, encontrar a menor configuração aceitável **entre as testadas** e avaliar descrições que ajudem o agente a usar o MCP. Não presumimos custo, capacidade ou velocidade a partir do nome do modelo. A arquitetura aprovada permanece v0.

## O que muda

| Braço | Mudança | Mantido |
|---|---|---|
| E0 / baseline | Catálogo do PR #8 (`7773b26`) | Seis tools, quatro skills, schemas, validação e respostas |
| E1 / guided_v1 | Descrições de uso, descrição dos campos e exemplos genéricos no `tools/list` | Mesmos comportamentos, skills e contratos de E0 |

E1 é selecionado pelo host, não pelo modelo. O default continua E0. Testes verificam equivalência dos resultados e identidade do catálogo E0 com o PR #8. O catálogo serializado cresceu de 14.091 para 26.953 bytes; bytes não são tokens. O custo adicional de contexto faz parte da comparação, não é removido do resultado.

Não usar somente as `instructions` de inicialização como intervenção: o bridge antigo não as apresentava ao modelo. Esta rodada usa o transporte MCP nativo e registra inicialização, catálogo, chamadas e respostas.

## Casos e etapas

Dois domínios novos, inteiramente fictícios: pessoa que oferece formação e startup que oferece um produto/serviço. São casos visíveis de validação, não holdout protegido: o autor dos casos viu também o relatório anterior. O autor de E1 não recebe estes casos; os geradores não recebem expectativas, resultados concorrentes ou rubrica do Judge.

1. Objetivo parcial: conversa e hipóteses; sem gerar imagens.
2. Referências e rótulos, palavras/pesos, restrições e texto adversarial importado como dado.
3. Exploração: duas direções conceitualmente distintas; planos reais pelo MCP e prompts de ativos sem texto.
4. Após gerar e compor as direções, a persona escolhe a primeira e pede duas variações da mesma direção, com o mesmo ativo. A diversidade passa a ser de execução, mantendo a identidade escolhida.
5. Crítica positiva e negativa por aspecto; ajuste local e contexto de anotações. Download não equivale a resultado alcançado; inferência não equivale a preferência confirmada.

Cada turno só é enviado após o anterior. A sessão mantém a própria história. Uma resposta não recebe os turnos futuros. Imagens e correspondência de IDs produzidas pelo coordenador são fornecidas na retomada; não se injeta uma resposta ideal. Chamadas de tools podem seguir caminhos diferentes.

## Matriz e regra de parada

- Começar em **low**, o menor effort anunciado no catálogo local para os três modelos. Registrar também modelo/effort observados no runtime, não somente pedidos.
- Triagem: 3 modelos × 2 braços × 2 casos = 12 trajetórias. Replicar independentemente as 12 células para examinar consistência: 24 trajetórias em low. Expor falhas, inclusive ausência de artefato; não substituir execuções ruins silenciosamente.
- Intercalar modelos e braços por caso/réplica. Registrar ordem, cache, falhas do serviço e interrupções. Sem seed ou temperatura controladas, não atribuir causalidade apenas à diferença das médias.
- Elevar para medium somente quando uma falha de raciocínio/planejamento se repetir. Falha de infraestrutura, contrato de saída ou compositor exige diagnóstico separado; não prova necessidade de modelo maior.
- Se nenhum braço passar, criar candidato novo a partir de falhas observadas, com nova versão e novas execuções. Conservar E0/E1 e seus resultados. Não alterar em silêncio o candidato avaliado.
- Se não houver evidência suficiente para mínimo consistente, conclusão será inconclusiva. Não transformar triagem em recomendação de produção.

## Pipeline comum e reparos

Um único provedor de imagem do ambiente gera os ativos de todos os braços; o MCP continua preparando estrutura e contexto. A versão interna exata do gerador é desconhecida quando não exposta. A qualidade do pixel não é capacidade exclusiva do modelo de planejamento.

O mesmo compositor renderiza planos C2, com catálogo fixo de fontes, política de encaixe de imagem e defaults documentados. Falha de overflow não reduz fonte nem altera copy automaticamente. Um reparo recebe somente o erro observado, com limite de uma tentativa por estágio, é registrado como intervenção e entra em custo/tempo. Falha persistente conserva o resultado incompleto e é inelegível à nota visual de sucesso. Não melhorar manualmente o criativo de um braço.

## Régua de aceitabilidade

LLM Judge no papel de solo founder crítico, sem acesso a modelo/braço, transcreve primeiro os fatos visíveis. Depois avalia alinhamento, qualidade profissional, encantamento e diversidade adequada à fase, cada um de 1 a 5 com evidências. A [rubrica](rubric.md) detalha âncoras. Dois julgamentos independentes; desacordo fica visível, sem média para ocultar erro crítico.

Aceitável exige artefatos completos/legíveis, notas ≥4 nas dimensões, e nenhum erro crítico factual, de permissão ou de escopo. Não se impõe uma sequência única de tools. Qualidade técnica e proxy de preferência são verificados separadamente. Encantamento simulado não demonstra satisfação humana, conversão, viralização ou retorno financeiro.

## Medidas e evidências

- Tokens nativos de entrada, cache, saída e raciocínio quando disponíveis; valores ausentes continuam desconhecidos. Registrar por turno e trajetória, evitando somar contadores cumulativos como deltas.
- Tempo de parede por turno, geração, composição e trajetória; quantidade de chamadas, erros, reparos, tentativas de geração e intervenções humanas/coordenador.
- Catálogos, fontes, skills, runner, inputs, assets e outputs com hashes. Versões do host/CLI/dependências e políticas aplicadas observáveis. Não copiar credenciais, prompts privados ou outras sessões.
- Ordenação por Pareto: qualidade aceitável primeiro; comparar tokens e latência separadamente. Sem tabela aplicável de preços/contabilização, não converter tokens em dólares ou afirmar qual é o mais barato.

O runtime usa autenticação normal do Codex, cwd vazio por execução e somente o MCP de estudo. Registrar ferramentas inevitáveis do host e qualquer uso proibido; flags não bastam como prova de isolamento. Probes de transporte são calibração, nunca resultados do benchmark.

## Limites e decisão

Sem mudanças em produção, memória persistente, Supabase, MLflow, autenticação do Compor, BYOK real ou UI. Sem treinamento de modelos. Feedback simulado exerce a trajetória; não vira dado humano nem consentimento real. Todos os logs desta avaliação ficam preservados até revisão. O PR reúne candidatos e evidência; promoção depende da avaliação de Matheus.
