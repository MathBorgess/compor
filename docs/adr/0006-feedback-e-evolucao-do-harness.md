---
status: accepted
---

# Feedback humano para avaliação e evolução do harness

Em 26/10/2026, Matheus fechou Q21–Q22 e esclareceu Q23: o feedback humano servirá para validar e aprimorar prompts, tools, trajetórias e o harness do Compor, sem treinar modelos. A coleta combina reações rápidas de utilidade com corretude e completude opcionais, preservando a diferença entre percepção, critério de avaliação e aceite da peça.

Reações 👍 útil, 👏 muito útil e 👎 não ajudou pertencem à resposta/proposta e à versão avaliada. O convite é discreto após o uso, sem bloquear o fluxo, pré-selecionar resposta positiva ou penalizar ausência. Campos não respondidos e “não sei” permanecem desconhecidos; reação não vira fato, preferência reutilizável na memória ou aprovação automaticamente. Mudança de versão não transfere a reação.

A seleção automática de uma amostra é configurável, limitada aos casos autorizados e cobre sucessos, falhas, rejeições e os três perfis de teste. Casos sem reação também permanecem elegíveis; registrar população elegível, seleção e limites evita tratar apenas elogios como qualidade. Seleção não dispara análise paga: lotes continuam sob comando e limite de gasto, conforme Q20.

## Consequências

- O fluxo é feedback associado à versão → amostra autorizada → curadoria → dataset com revisão identificada → avaliação em lote → candidato versionado do harness. Comparações de prompts, contratos de ferramentas e trajetórias usam os mesmos casos e critérios, com fontes de avaliação humanas, determinísticas e de modelos distinguíveis.
- Resultados podem propor mudanças no harness; não alteram automaticamente peças, campanhas fixadas, memória, prompts ativos, permissões ou políticas. Avaliar uma trajetória não autoriza repetir ferramentas com efeitos externos. Treinamento e ajuste de pesos não integram a solução.
- IDs do alvo, versão, origem, critério e revisão vinculam feedback e evidência. Reenvio não multiplica votos; correções preservam a revisão anterior. A versão do dataset usada em cada comparação precisa ser identificável, sem depender apenas de uma tag mutável.
- A atualização posterior de Q19 protege traces com avaliação contra expurgo automático, preservando reação/avaliação e contexto autorizado, mesmo sem seleção para dataset. Cinco dias valem somente para traces sem avaliação. Reação tardia recebida após expurgo legítimo é preservada ligada à versão, com “trajetória indisponível”; não reconstruir a execução como evidência original. A proteção do trace não equivale à seleção automática para dataset.
- A UI continua sem Python obrigatório. Feedback, amostragem e avaliações têm contratos separados; nenhuma equivalência entre bibliotecas cliente e servidor é presumida. Esta decisão não implementa coleta, modelos avaliadores, alterações no harness ou implantação.

Fontes do contrato técnico: [feedback no MLflow](https://mlflow.org/docs/latest/genai/assessments/feedback/), [expectativas](https://mlflow.org/docs/latest/genai/assessments/expectations/) e [datasets de avaliação](https://mlflow.org/docs/latest/genai/datasets/). A direção do produto e o significado de Q23 vêm da resposta de Matheus no chat.
