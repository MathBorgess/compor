---
status: accepted
---

# Memória proativa e observabilidade autorizada

Em 27/10/2026, Matheus decidiu que o agente poderá salvar proativamente hipóteses reversíveis de preferência, com escopo e evidência, preservando preferências confirmadas. Em exploração solicitada, poderá propor alternativas que divergem de uma preferência inferida, explicando o motivo e permitindo rejeição. O tratamento de memórias da pessoa é distinto da autorização para usar conteúdo ou trajetórias em curadoria e melhoria do harness.

O MLflow permanece como destino privado na Oracle, com SQLite e arquivos persistentes como opção inicial; traces autorizados são preservados para análise, sem expurgo automático de cinco dias. Conteúdo requer autorização específica. Trechos anteriores à revogação continuam elegíveis para a finalidade autorizada, mesmo quando recebidos depois; interações posteriores não entram nessa curadoria. Os casos sustentam avaliações de prompts, tools e trajetórias, sem treinamento de modelos nem promoção automática do harness. A fila persistente e o reenvio após falhas ficam para implementação futura; podem existir lacunas nos traces da v0.

Esta decisão atualiza parcialmente os [ADRs 0005](0005-observabilidade-centralizada-mlflow.md) e [0006](0006-feedback-e-evolucao-do-harness.md), preservados como histórico. Capacidade da Oracle, custo acumulado, autenticação, integração e recuperação precisam de validação; a decisão não aprova a arquitetura integral nem comprova implementação.
