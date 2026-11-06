# ADR 0025 — Prova de desfecho da exploração

- Estado: recorded
- Data: 06/11/2026
- Contexto: correção do PR 18 para distinguir recusa de credenciais de resultado desconhecido, preservando a trava contra repetição.

## Decisão

O servidor cria uma capacidade aleatória por tentativa e vincula atomicamente seu compromisso à reserva. Apenas o processo que recebeu a confirmação de uma reserva nova despacha a geração. A capacidade permanece efêmera no servidor e não é enviada ao navegador; o banco conserva seu compromisso em uma tabela sem acesso direto de clientes. Uma reserva existente não recebe capacidade nova. O desfecho autenticado vincula conta, projeto e tentativa e é serializado com o gate por conta.

O servidor registra rejeição somente quando o adaptador identifica a resposta definitiva de credenciais recusadas do fornecedor. A rejeição é terminal, não contabiliza imagem concluída e exige retomada explícita da pessoa. O mesmo identificador de tentativa não pode ser reutilizado para uma nova chamada. Erros de transporte, timeout, respostas inesperadas e falhas de armazenamento permanecem desconhecidos; não há repetição automática. Uma resposta perdida é reconciliada pelo estado durável, sem assumir sucesso pela ausência de resposta.

A conclusão também requer a prova e um objeto salvo. Uma chamada autenticada de cliente à função legada, ou um objeto inserido pelo cliente, não autoriza concluir uma reserva protegida criada pelo servidor. Isso substitui a parte do desenho anterior em que a presença do objeto bastava como evidência de conclusão. Um cliente autenticado ainda pode criar diretamente uma reserva com uma capacidade que ele próprio conhece e produzir um registro concluído; essa reserva não leva o servidor a despachar a geração, mas não comprova a procedência da imagem contra seu próprio titular. Essa garantia mais forte exigiria autoridade distinta do servidor perante o banco. A prova não comprova fatura ou execução exatamente uma vez; o armazenamento privado continua sujeito aos seus contratos próprios.

## Implantação e limites

A migração `20261106000025` e o código que usa os novos contratos precisam de implantação coordenada. Antes de aplicá-la, identifique o banco efetivamente usado pelo ambiente, inventarie as migrações e os objetos necessários e faça backup e ensaio em ambiente isolado. Interrompa novas gerações e aguarde ou preserve como não resolvidas as operações de processos antigos antes de trocar o contrato; um processo que já reservou pode ainda enviar uma solicitação ao fornecedor. Não aplique migrações às cegas nem libere reservas antigas sem evidência confiável do desfecho.

Clientes e instâncias antigas usam funções anteriores e não são compatíveis com o novo contrato de reserva. Ao reverter o código, considere dados e funções já migrados: uma versão antiga pode falhar fechada ou não compreender o novo estado, e reabilitar o caminho antigo de conclusão enfraqueceria a proteção. Planeje uma reversão coordenada, sem descartar estados incertos ou restaurar funções inseguras. A aplicação local e os testes simulados não comprovam aplicação no banco de produção, compatibilidade de clientes externos ou implantação da versão.
