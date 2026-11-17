# ADR 0065 — Fidelidade de imagens pequenas no chat

Data: 17/11/2026. Implementação local; publicação não verificada.

O envio de referências visuais ao chat preparava sempre uma cópia JPEG, mesmo para um PNG pequeno já dentro do limite. Isso alterava os bytes, removia a transparência sobre fundo branco e podia perder detalhes antes de o agente receber a imagem.

Para mensagens e leituras automáticas de referências, um PNG ou JPEG com até 512 pixels em cada dimensão e até 35 KiB segue para o `input_image` com seus bytes e MIME originais. A decodificação e as validações de formato e dimensões continuam obrigatórias; o original em IndexedDB não é modificado. Arquivos maiores continuam usando a cópia JPEG reduzida já existente, com fundo branco, dentro dos mesmos limites por imagem e por mensagem. O fluxo de geração do post mantém sua própria preparação e confirmação de cópias para transporte acima de 2 MiB.

Esta decisão não amplia limites nem modifica a exploração de referências, que ainda usa contexto textual, e não prova o que o fornecedor compreendeu da imagem. Testes locais com imagens sintéticas verificam os bytes no navegador e no corpo enviado ao fornecedor simulado; não houve chamadas pagas.
