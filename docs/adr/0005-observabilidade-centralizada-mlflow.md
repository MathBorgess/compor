---
status: accepted
---

# Observabilidade centralizada no MLflow da Oracle

Em 26/10/2026, Matheus determinou adicionar traces centralizados em MLflow na máquina Oracle para observar o uso do Compor e realizar avaliações. O backend passa a ter essa responsabilidade além de compatibilidade e diagnóstico; essa decisão substitui a limitação anterior de apenas servir configuração e receber diagnóstico pontual. Inferência e composição continuam nos caminhos já definidos, sem transformar a Oracle em proxy de geração.

O processo principal do Electron instrumenta as operações do produto e dos três perfis de teste, correlacionando tentativa, tarefa, organização e versões. Um endpoint autenticado recebe payloads permitidos e limitados para o MLflow privado; credenciais de IA e segredos administrativos não entram nos traces. O envio é assíncrono, com fila limitada e sem bloquear geração, salvamento, exportação ou sincronização. Falha na telemetria não provoca repetição da inferência.

## Política fechada em Q18–Q20

Matheus confirmou em 26/10/2026:

- **Q18 — Conteúdo:** telemetria opcional com metadados por padrão. Entradas e saídas com texto ou imagem só são capturadas em sessões ou casos de teste/avaliação autorizados para essa finalidade. Credenciais continuam excluídas mesmo nesses casos. Sincronização GitHub e permissão de geração não concedem consentimento para coleta.
- **Q19 — Retenção:** traces operacionais são retidos por cinco dias. Somente casos explicitamente selecionados são preservados em datasets separados, com origem e consentimento. Essa seleção não preserva automaticamente a sessão inteira; finalidade e prazo do dataset devem ser declarados ao selecioná-lo, sem herdar retenção indefinida.
- **Q20 — Avaliações:** execução em lotes, começando por critérios determinísticos e revisão humana. Modelos avaliadores só são acionados por comando explícito com limite de gasto. Receber um trace não dispara chamadas pagas; a credencial e o custeio do avaliador são declarados na execução, sem uso automático da chave do usuário.

Critérios, versões, origem e resultado da avaliação ficam identificados. Notas automáticas não constituem aprovação humana nem demonstram por si experiência satisfatória. Os resultados de código, pessoa e modelo permanecem distinguíveis.

## Base técnica a validar

O SDK TypeScript do MLflow suporta Node e pode instrumentar o processo principal, sem Python obrigatório no cliente. Uma alternativa é exportar spans OpenTelemetry por OTLP/HTTP. MLflow recebe traces com backend SQL; para o piloto, SQLite e diretório de artefatos explícito evitam exigir PostgreSQL, Redis ou armazenamento de objetos adicionais. Essa é uma base simples para validação, não capacidade de produção comprovada.

O SDK `@mlflow/core` 0.4.0 inspecionado requer Node >=22; sua compatibilidade com a versão Electron empacotada precisa ser testada. MLflow 3.17.0 requer Python >=3.10 no servidor. A referência anterior de 1 CPU/1 GiB não comprova capacidade para o novo serviço; número de workers, consumo, disco, ingestão, reinício e retenção serão medidos no alvo identificado antes de implantação. Nenhum serviço ou infraestrutura foi implantado nesta decisão.

Fontes oficiais consultadas em 26/10/2026: [SDK TypeScript](https://mlflow.org/docs/latest/api_reference/typescript_api/index.html), [ingestão OTLP](https://mlflow.org/docs/latest/genai/tracing/opentelemetry/ingest/), [backend store](https://mlflow.org/docs/latest/self-hosting/architecture/backend-store/), [avaliação](https://mlflow.org/docs/latest/api_reference/python_api/mlflow.genai.html) e [feedback](https://mlflow.org/docs/latest/genai/assessments/feedback/).
