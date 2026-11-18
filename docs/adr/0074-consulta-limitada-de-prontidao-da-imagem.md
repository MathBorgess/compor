# ADR 0074 — Consulta limitada de prontidão da imagem

Em 18/11/2026, um planejamento de referências permaneceu em `running` e bloqueou a reserva da arte do post. A interface repetia o envio da imagem a cada resposta `busy`, com a credencial e as imagens no corpo e novas validações de fornecedor e banco.

A resposta `busy` confirma que aquela chamada não despachou imagem. A espera usa `POST /api/agent/image/status` com identidade autenticada, prova assinada e versão da reserva original. A consulta identifica a classe de bloqueio sem expor outros pedidos da conta e pode renovar somente a prioridade ainda válida da mesma reserva. Ela dispensa chave e anexos e não consulta o fornecedor, cria uma execução nem encerra um planejamento. O navegador consulta em até quatro intervalos crescentes de 2,5, 5, 7,5 e 10 segundos. Um estado pronto permite uma nova admissão pela rota de geração, com as verificações vigentes de credencial, contexto e autoridade visual. Um novo `busy`, espera esgotada ou estado sem confirmação devolve o controle para consulta explícita. No chat, a espera dos turnos aumenta de dois para quatro e oito segundos, com até vinte intervalos.

O planejamento original pode ser consultado em Referências no projeto de origem, usando o vínculo e a credencial originais. A consulta pode confirmar um estado terminal da sessão existente. Idade ou silêncio do fornecedor preservam o registro e a trava. Alterar ou repetir uma exploração segue os gestos e as provas de intenção existentes.

O navegador envia BYOK no cabeçalho `x-compor-openai-key` quando a operação exige a chave. O servidor ainda aceita o campo legado em requisições antigas e rejeita o envio pelos dois meios. Uma BYOK fornecida e inválida continua sem fallback para o Vault. A credencial permanece visível para quem controla a aba. A consulta de prontidão usa somente os dados da reserva.

Esta decisão complementa os ADRs 0038, 0061, 0062 e 0069. Substitui o reenvio contínuo no cliente. A migration `20261118000042_image_tool_wait_status.sql` é aditiva e integra a verificação de produção prevista no ADR 0043.
