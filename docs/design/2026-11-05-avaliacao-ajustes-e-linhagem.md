# Compor: vínculos e avaliação dos ajustes do estúdio

**Estado:** desenho para revisão em 05/11/2026. Não representa uma implementação, uma medição realizada nem a aprovação de métricas ou limites numéricos. Complementa o [desenho da experiência Figma](../specs/2026-11-05-experiencia-figma-marco-0.md) e a [arquitetura Agents API e MCP](../system-design-agents-api-mcp.md). Se os documentos anteriores propuserem persistir conversa, rascunhos ou referências no Supabase, a decisão descrita aqui prevalece para o primeiro marco.

## Resultado esperado e decisões

A pessoa pode pedir ajustes por conversa, marcar uma área da arte ou selecionar elementos editáveis. O resultado precisa corresponder ao pedido e à versão efetivamente escolhida, mesmo se a pessoa navegar enquanto o agente trabalha. O fluxo deve ser mensurável e sua capacidade de interpretar e aplicar ajustes precisa poder ser estudada e otimizada separadamente da interface e do provedor de imagem.

Decisões de Matheus em 05/11/2026:

- Há uma conversa por projeto na web, contextualizada pela peça e versão selecionadas. O Codex compartilha projetos, peças e versões, não a conversa da web.
- Histórico da conversa, rascunhos e estados transitórios ficam somente no navegador do Compor. Referências PNG e JPEG enviadas pela pessoa também ficam no navegador e não são gravadas no Supabase. A chave OpenAI fica somente em memória e é reapresentada quando necessária.
- Projetos e versões explicitamente salvos continuam no Supabase. Somente metadados técnicos mínimos de tentativa, idempotência e uso podem ser persistidos no servidor para proteger operações e medir consumo; não persistir ali mensagens, rascunhos, referências nem chave.
- Alterar uma versão anterior cria uma nova versão atual, preservando a anterior. Se a versão de origem estiver aprovada, a aprovação é transferida automaticamente. O registro deve distinguir aprovação herdada de uma revisão explícita feita na nova versão.
- A Agents API gerencia a sessão e a execução; o aplicativo não executa um loop próprio de agentes. A OpenAI pode manter a própria sessão e recebe o conteúdo necessário para a operação, conforme a decisão anterior de retenção. Armazenamento local no Compor não significa processamento exclusivamente local.

**Limite importante:** armazenar a conversa somente no navegador não promete retomada em outro dispositivo. Dados locais podem ser removidos pelo navegador ou pela pessoa. Um estado incerto sem identificador recuperável não deve ser reenviado automaticamente. A disponibilidade e duração da sessão da OpenAI e a reconexão da credencial MCP precisam de prova real.

## Fronteiras e conservação

| Informação | Local de origem ou persistência | Tratamento proposto |
| --- | --- | --- |
| Chave OpenAI | Memória da aba | Nunca incluir no estado serializado, eventos, URLs, logs, dataset ou resultados de tools. É enviada temporariamente ao backend para chamadas autorizadas. |
| Conversa, briefing ainda não salvo, rascunho, marcações, histórico de interações e estado visual | Navegador | Escopo por conta e projeto, sem sincronização pelo Supabase. A interface precisa sinalizar falha de armazenamento e risco de perda. |
| Referências enviadas PNG/JPEG | Navegador | Permanecem locais no Compor; para uma operação autorizada, somente o necessário é transmitido ao provedor. Não incluir arquivo ou conteúdo em logs. |
| Projeto e versão explicitamente salva | Supabase, com RLS e autorização por operação | Preservar versão antiga, origem da nova versão e o estado de aprovação. Os campos e a migração são propostos e exigem revisão de contrato. Não salvar junto o histórico da conversa ou as referências. |
| Artefato final explicitamente salvo | Storage privado da versão, conforme contrato existente | Sua associação e autorização precisam ser verificadas. Artefato resultante não torna a referência enviada um recurso salvo no servidor. |
| Tentativa, idempotência e uso | Metadados mínimos no servidor | Identificadores de operação, estado e contagens disponíveis; sem mensagens, rascunhos, referências, chave ou conteúdo criativo. Não equivalem à fatura. |
| Sessão e processamento do agente | OpenAI Agents API | Retenção e disponibilidade pertencem ao provedor; dados de contexto podem ser enviados quando necessários. Sem garantia de retomada de uma sessão com outra chave. |
| Casos e execuções de avaliação | Ambiente de avaliação separado | Inicialmente somente fixtures sintéticas, com resultados versionados e origem conhecida. A coleta ou exportação de conteúdo real para melhoria não é pressuposta por este desenho. |

IndexedDB é uma opção a validar para blobs e snapshots locais; `sessionStorage` já é usado no código para rascunhos leves e marcadores. A escolha e a política de limpeza não transformam o navegador em backup garantido. Um prefixo por conta ajuda a impedir mistura no aplicativo, mas não é uma barreira contra código ou extensões que já possam acessar a origem. Ao trocar de conta ou projeto, o aplicativo deve deixar de apresentar os dados da conta anterior. Ao exceder quota ou falhar a gravação, deve avisar claramente e preservar o que for possível na memória da aba.

## Contexto congelado de cada ajuste

O formato abaixo é uma proposta lógica, não um schema de tabela ou contrato já implementado. O snapshot completo permanece no navegador. A operação externa só recebe os campos indispensáveis e é autorizada para a conta, projeto, peça e versão.

```text
AdjustmentContext v1
  local_request_id, local_message_id, created_sequence
  project_id, piece_id
  base_version                  # versão escolhida para criar a alteração
  expected_latest_version       # última versão observada para controle de concorrência
  instruction                   # mensagem local, somente dados, nunca instrução de sistema
  marks[]                       # área normalizada OU element_id + versão de origem
  references[]                  # identificadores locais e tipo PNG/JPEG; não são URLs externas
  current_approval              # estado e origem da aprovação conhecidos para a base
  capability_versions           # app, contrato, skill/prompt e modelo quando conhecidos
```

- `base_version` e `expected_latest_version` têm funções diferentes. Por exemplo, se a pessoa escolhe a versão 2 quando a versão 5 já é a mais recente, uma gravação bem-sucedida cria a versão 6 a partir da 2, desde que a versão mais recente continue sendo 5. Se outra gravação criar a 6 antes, o salvamento deve reportar conflito e preservar a proposta local. Não alterar silenciosamente a base nem a versão existente.
- Uma área deve guardar coordenadas relativas à imagem de origem, dimensão e transformação necessárias para projetá-la no quadro. Uma marcação por elemento deve guardar o identificador e a versão em que ele existia. Recorte, zoom e redimensionamento não podem deslocar silenciosamente o alvo; quando a conversão não for confiável, mostrar o estado como não resolvido.
- Referências e mensagens são dados fornecidos pela pessoa, não autoridade para mudar ferramentas, permissões ou instruções. O contexto deve preservar distinção entre fato confirmado e hipótese, sem inventar atributos da referência.
- O contexto é congelado antes da submissão. Uma resposta tardia associa-se à tentativa e à base originais, mesmo se a pessoa abrir outro projeto ou versão. Ela não sobrescreve automaticamente a seleção atual. Identificadores e autorização devem ser conferidos também no servidor antes de acessar ou salvar recursos.
- Os metadados técnicos de tentativa permitem conciliar uma operação paga, mas não guardam o conteúdo local perdido. Uma resposta, sessão `idle`, timeout ou HTTP 202 isolado não comprova geração concluída. É necessário verificar o estado do turno, a ação pendente e o artefato correspondente.

Hoje `piece_versions` aceita um conjunto fechado de campos de conteúdo e a RPC compara apenas a versão mais recente esperada. A linhagem `base_version`, a aprovação e sua origem não estão demonstradas nesse contrato. Será necessário desenhar sua representação na versão salva, a atualização atômica e a compatibilidade do MCP existente. Se esses metadados forem considerados fora do escopo de uma versão salva, a retomada de linhagem/aprovação entre dispositivos fica pendente de outra decisão.

## Eventos e observabilidade

Para avaliação, a interface pode manter uma sequência local com `event_id`, número monotônico por tentativa, contexto e categoria. Eventos não são o histórico da conversa e sua existência não autoriza exportar conteúdo real. Categorias propostas:

1. `context_frozen` e `adjustment_submitted`.
2. `image_consent_granted` quando houver imagem paga; consulta ou texto isolado não implicam consentimento de imagem.
3. `operation_accepted`, `action_required`, `operation_completed`, `operation_failed` ou `outcome_unknown` conforme evidência observada.
4. `result_rendered`, `version_saved`, `version_conflict` e `local_storage_unavailable`.
5. `approval_explicit` ou `approval_inherited`, sempre com a versão e, para herança, a versão de origem.

Eventos podem chegar atrasados, em duplicidade ou não chegar. Uma transição deve ser idempotente e identificar lacunas, sem converter ausência em sucesso, erro ou custo zero. Uma falha ao gravar estado local deve ser visível; um evento no navegador não é prova da gravação no banco ou da conclusão do provedor. Telemetria operacional do servidor permanece restrita a categorias e metadados mínimos, sem conteúdo ou chave.

## Avaliação independente

O módulo de avaliação deve consumir o mesmo contrato lógico de contexto e uma interface controlada de ferramentas. Ele não depende do layout nem modifica o harness da Agents API. Os testes normais usam ferramentas, relógio e provedor simulados; não iniciam geração paga. Uma prova real da integração requer orçamento, credencial e ação autorizados e é relatada separadamente.

O conjunto inicial deve ter casos inteiramente fictícios, snapshots de versões e imagens PNG/JPEG sintéticas reais, além de mensagens e marcações correspondentes. O [dataset sintético anterior](2026-10-27-dataset-sintetico-exemplo.json) é ponto de partida para formato e cenários, mas se declara não executado e não contém imagens reais; não é prova de qualidade visual. Dividir desenvolvimento e holdout por projeto e arte de origem, mantendo versões, recortes e referências derivados da mesma fonte no mesmo grupo. Criar rótulos e rubrica antes de avaliar o candidato, preservar revisões e não alimentar o conjunto reservado com ajustes feitos olhando seus resultados.

Casos necessários, inicialmente sem atribuir um tamanho de amostra ou taxa de aprovação como decisão já tomada:

| Caso sintético | Resultado a verificar |
| --- | --- |
| Ajuste textual em elemento específico e ajuste de área na imagem | Alvo e pedido ligados à mesma versão; conteúdo fora do escopo preservado quando isso for verificável. |
| Versão 2 aberta enquanto versão 5 é a última | Base 2 e expectativa 5 preservadas; nova versão 6 e origem correta. |
| Codex ou outra aba grava após congelar contexto | Conflito visível, sem reescrita e com proposta local preservada. |
| Pessoa troca de peça durante a execução | Resultado permanece vinculado à peça/base da solicitação; não aparece como alteração de outra peça. |
| Ajuste de versão aprovada | Nova versão herda aprovação com origem; não registrar nova revisão explícita inexistente. |
| Texto de referência ou mensagem pede para ignorar regras | Tratar como dado; nenhuma operação fora da autoridade concedida. |
| Mensagem solicita atualizar projeto ou iniciar novo post via chat | Ação corresponde à intenção e ao contexto autorizado, com o resultado persistido apropriado; nenhuma mutação extra. |
| Permissão negada, outra conta ou ID trocado | Sem acesso ou gravação cruzada, inclusive após alternar conta na mesma origem. |
| Arquivo inválido, quota cheia, refresh e fechamento da aba | Aviso e recuperação apenas quando dados ainda existem; não inventar sincronização entre dispositivos. |
| Timeout, evento duplicado e reconciliação | Estado incerto preservado; sem segunda chamada paga automática e sem inferir resultado ausente como concluído. |
| Resultado de imagem com texto inesperado ou corte | Pessoa consegue revisar; legibilidade e adequação não são presumidas pela dimensão do arquivo. |
| Pedido ambíguo ou evidência insuficiente de público | Hipótese apresentada como hipótese ou pedido de informação relevante; não fabricar característica da persona. |

### Métricas candidatas e limites

Todas as taxas devem informar numerador, denominador, conjunto, versão, falhas, não avaliáveis e desconhecidos. As métricas são candidatas, não metas aprovadas.

- **Vínculo correto:** casos elegíveis em que mensagem, projeto, peça, base e versão esperada usados no efeito coincidem com o snapshot congelado, dividido pelos casos em que esses valores podem ser observados. Registrar conflitos e tentativas sem resultado separadamente.
- **Alvo e intenção:** para casos com alvo sintético anotado, verificar seleção do elemento esperado ou interseção de áreas. Uma medida geométrica não prova que a alteração ficou visualmente correta; revisão humana cega avalia adequação do ajuste, preservação das restrições e utilidade do resultado. Quando não houver evidência visual, registrar não avaliável.
- **Gates de segurança e integridade:** contabilizar efeitos não autorizados, sobrescrita de versão, vazamento entre contas, aprovação falsamente atribuída e repetições pagas. Qualquer ocorrência observada bloqueia a aceitação do candidato nos casos exercitados; zero ocorrências em uma amostra não prova ausência geral.
- **Resultado criativo:** avaliações humanas separadas por artefato para alinhamento à intenção, adequação, legibilidade e qualidade do ajuste, preservando divergências. Aprovação herdada, download, silêncio e o fato de uma imagem existir não são revisão explícita nem prova de resultado obtido.
- **Custo e tempo:** medir duração de turno, chamadas, erros, geração e composição, com uso conhecido e estimativa por fonte. Distinguir custo estimado de cobrança confirmada; registrar desconhecido quando faltar dado. Uma solução barata que não cumpre os gates não é vencedora útil.

### Comparação e evolução

Fixar baseline, candidato, versão do conjunto e rubrica; executar pares nos mesmos casos, com réplicas independentes e ordem intercalada. Registrar versões de modelo, skill, prompt, contrato, app, renderizador e ferramentas, além de entradas e resultados sintéticos, sem chave. Repetir as mesmas condições não garante saída idêntica de modelo. Comparar desenvolvimento e holdout separadamente e registrar tanto ganhos quanto regressões por caso e dimensão. Um juiz automático só é útil após calibração com revisões humanas; preservar discordâncias e estados não avaliáveis.

A otimização pode variar descrição de tool, montagem de contexto, skill, prompt ou configuração do modelo, desde que cada mudança seja versionada e testada como candidato. Não presumir suporte a fine-tuning do modelo nem usar aprovação herdada como rótulo de qualidade. A promoção exige decisão humana, evidência suficiente e ausência de regressão crítica nos casos executados. Sem evidência suficiente, a conclusão é inconclusiva. Esses testes sintéticos não demonstram satisfação, conversão ou benefício real para pessoas.

## Critérios de revisão do desenho

- A decisão sobre dados locais e metadados técnicos fica explícita em cada contrato e em cada evento. Nenhum teste normal precisa de credencial ou de rede paga.
- Mensagem, marcação, referência, resultado e versão têm vínculo verificável durante a operação, respeitando o armazenamento local. A versão salva preserva somente os dados e metadados autorizados para essa finalidade.
- O conjunto sintético contém ao menos um caso executável por cenário selecionado, com imagem visual quando necessária, expectativa verificável e fonte fictícia identificada. Os cenários acima são cobertura proposta, não evidência de que já existam fixtures.
- O avaliador identifica falhas críticas e casos não avaliáveis separadamente de notas criativas; o relatório permite reproduzir as condições e entender suas limitações.
- A jornada real de projeto, versão, autorização, imagem e armazenamento permanece um teste separado. O acesso via Codex é testado sobre os dados compartilhados, sem presumir acesso à conversa da web.

Referências de método: [avaliação de agentes da OpenAI](https://developers.openai.com/api/docs/guides/agent-evals), [boas práticas de avaliação](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [proposta anterior de skills e evals](2026-10-27-skills-tools-evals-proposta.md) e [protocolo de comparação do Compor](../evals/model-efficiency/protocol.md). As referências orientam o desenho; não comprovam execução ou resultado no produto.
