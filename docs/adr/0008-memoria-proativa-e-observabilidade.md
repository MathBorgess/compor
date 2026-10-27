---
status: accepted
---

# Memória proativa e observabilidade autorizada

Em 27/10/2026, Matheus decidiu que o agente poderá salvar proativamente hipóteses reversíveis de preferência, com escopo e evidência, preservando preferências confirmadas. Em exploração solicitada, poderá propor alternativas que divergem de uma preferência inferida, explicando o motivo e permitindo rejeição. O tratamento de memórias da pessoa é distinto da autorização para usar conteúdo ou trajetórias em curadoria e melhoria do harness.

Na continuação, definiu que hipóteses iniciam no escopo da tarefa ou campanha, sem propagação automática à marca ou organização, e que a pessoa escolhe dimensões a variar ou manter. Rejeições recorrentes de tipografia ou partes da composição constituem evidência contextual de reforço negativo e podem apoiar hipóteses de não preferência; a pessoa poderá consultar e revisar essas não preferências. Para o primeiro experimento, duas rejeições distintas do mesmo aspecto no mesmo escopo são um critério hipotético de recorrência, ainda não validado. Evidência posterior contrária pode motivar uma sugestão de revisão, sem substituir preferências confirmadas. A política de ampliação de escopo permanece aberta. O sinal não substitui uma preferência confirmada, não comprova não conclusão da tarefa nem autoriza telemetria ou uso para melhoria por si só.

Ao rejeitar uma composição, a pessoa pode selecionar o aspecto ou explicar o motivo opcionalmente; sem motivo explícito, a causa inferida pelo agente é uma hipótese, não um fato. A pessoa pode consultar, confirmar, corrigir ou remover suas não preferências quando quiser e receber sugestões ocasionais de revisão. A frequência dessas sugestões não foi definida.

O MLflow permanece como destino privado na Oracle, com SQLite e arquivos persistentes como opção inicial; traces autorizados são preservados para análise, sem expurgo automático de cinco dias. Conteúdo requer autorização específica. Trechos anteriores à revogação continuam elegíveis para a finalidade autorizada, mesmo quando recebidos depois; interações posteriores não entram nessa curadoria. Os casos sustentam avaliações de prompts, tools e trajetórias, sem treinamento de modelos nem promoção automática do harness. A fila persistente e o reenvio após falhas ficam para implementação futura; podem existir lacunas nos traces da v0.

No piloto, tarefas reais serão comparadas com o processo habitual da pessoa, considerando direção criativa, diversidade útil e conclusão. A avaliação inclui não concluintes e registra resultados desconhecidos como desconhecidos; não pressupõe benefício demonstrado.

Esta decisão atualiza parcialmente os [ADRs 0005](0005-observabilidade-centralizada-mlflow.md) e [0006](0006-feedback-e-evolucao-do-harness.md), preservados como histórico. Capacidade da Oracle, custo acumulado, autenticação, integração e recuperação precisam de validação; a decisão não aprova a arquitetura integral nem comprova implementação.
