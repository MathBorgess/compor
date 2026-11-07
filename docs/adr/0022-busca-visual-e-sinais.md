# ADR 0022 — Busca visual e sinais explícitos

- Estado: recorded
- Data: 06/11/2026
- Fonte: decisões de Matheus na revisão local e ADR 0021.

## Implementação

O estúdio oferece consulta explícita a boards públicos do Pinterest selecionados pelo Phoenix e apresenta apenas pins individuais com título, link e prévia. A pessoa autoriza a consulta e carregamento das prévias; o texto digitado não é transmitido ao Pinterest, mas os boards escolhidos podem revelar o assunto geral. O navegador carrega as prévias de `i.pinimg.com` sem referrer. Os resultados são dados externos: título não é instrução, licença ou garantia de adequação. A busca pode retornar vazia ou indisponível; a conversa continua. O endpoint valida origem, sessão, propriedade do projeto, entrada e limites e não aceita URLs arbitrárias para requisições de servidor.

Escolhas, rejeições e comentários associados à URL e ao board são sinais explícitos. Persistem na conta e no projeto sob RLS; correções são eventos adicionais vinculados ao evento anterior, sem apagar história. A leitura usa o token autenticado e o acesso ao projeto é revalidado. A interface consulta escolhas sob pedido. Até os 500 sinais mais recentes acessíveis pela conta alimentam o roteamento de boards em outros projetos: por referência é considerada a última escolha ou rejeição vigente e há suavização de contagens. Esses sinais não são impressões, preferências confirmadas nem aprovação de uma peça. Comentários são preservados e consultáveis, mas não são interpretados pelo ranqueamento nesta implementação. A relevância dos candidatos é uma ordenação lexical dos títulos, não um julgamento de imagens ou validação de audiência.

A migração `20261106000017_reference_signals.sql` precisa ser revista e aplicada ao ambiente autorizado. Ela concede somente leitura e inserção delimitadas por RLS; não usa service role. A integridade de resultados, a cobertura do catálogo externo, a relevância e o isolamento entre contas reais continuam a verificar. Os testes locais usam fornecedores simulados, sem busca externa ou geração paga. Resultados e sinais não são adicionados automaticamente ao moodboard nem enviados ao modelo. Ao escolher “Usar na conversa e na Direção”, a pessoa autoriza uma cópia da prévia PNG/JPEG no navegador; a imagem, identificada e com sua origem, passa a integrar o contexto visual enviado nos próximos turnos e pode ser escolhida como exemplo ou contraexemplo Agile. O proxy de prévia aceita somente `i.pinimg.com`, recusa redirecionamentos e limita bytes; o armazenamento valida formato e dimensões. Escolher a imagem não aprova a peça nem obriga seu uso em geração.

Este registro complementa o ADR 0021 e altera apenas a exploração visual externa descrita como ausente no ADR 0019. A rota sintética `/api/studio/decision` mantém seu contrato histórico e não é apresentada como busca real.
