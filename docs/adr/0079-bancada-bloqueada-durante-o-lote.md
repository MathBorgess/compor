# ADR 0079 — Interações durante a geração de propostas

Decisão de Matheus em 21/11/2026. Durante cada lote de três propostas, a bancada mostra o carregamento desde a verificação do pedido e mantém a pausa explícita disponível. O navegador conserva as escolhas e o texto em edição e bloqueia as interações da bancada, da conversa e da navegação do projeto enquanto prepara, planeja e gera o lote.

A leitura automática da seleção aguarda a liberação da bancada. Se já houver um turno em andamento, a bancada orienta a aguardar ou consultar esse pedido antes de solicitar novas propostas. A confirmação das imagens libera a escolha durante a janela de revisão do lote. A pausa e os estados que exigem recuperação devolvem os controles apropriados. A sequência segue os prazos e as guardas de escopo, sessão e credencial dos ADRs 0029 e 0072.

A consulta de um plano anterior usa a revisão atual do recibo local e reconfirma a identidade da tentativa. Continuar o mesmo plano exige um novo clique depois de concluída a pausa. A retomada usa a época de revogação confirmada, preserva o plano e despacha o lote vinculado uma vez.

Esta decisão complementa as ações e o progresso da bancada descritos nos ADRs 0054 e 0073.
