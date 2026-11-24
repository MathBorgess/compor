# ADR 0086 — Lotes confirmados e rascunhos de referência

Estado: implementação local em validação. Decisão de Matheus em 23/11/2026, durante o teste do preview do PR 79.

## Decisão

O pedido explícito de propostas pode iniciar o primeiro lote antes de perguntas do agente. Após cada lote de três imagens concluídas, o estúdio apresenta a espera de 15 segundos e só inicia outro lote mediante novo pedido explícito. Isso substitui a continuação automática e o limiar de duas rodadas dos ADRs 0029, 0067 e 0079; preserva as travas de identidade, autorização, conflito, recuperação e resultado desconhecido. Abrir a tela ou conectar a IA não gera imagens.

As imagens de proposta são referências, não arte final. O servidor usa o mesmo `gpt-image-2.6-flare`, com qualidade e complexidade `low`, PNG e dimensões 768×960 (4:5) ou 720×1280 (9:16). A arte final mantém seu perfil anterior. O tamanho e a complexidade menores visam reduzir a latência, sem promessa de tempo fixo. A [documentação do provedor](https://developers.openai.com/api/docs/guides/image-generation) descreve os limites de tamanho e opções; uma medição real é necessária para quantificar a melhora.

A descrição usada para gerar ou editar arte fica recolhida por padrão e pode ser aberta pela pessoa.
