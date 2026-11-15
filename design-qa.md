# Verificação visual — Referências, 15/11/2026

Resultado visual: aprovado no escopo observado, sem P0/P1/P2 aberto após a rodada de correções. Isso não substitui a avaliação humana do desenho nem os gates executáveis.

Referência: exemplo 3 escolhido por Matheus, com os fluxos posteriores de Pinterest e propostas. [Comparação pareada e capturas](docs/design/2026-11-15-references/comparacao.md).

Inspeção no Next real com Chrome local, em 1440 × 1024 e 390 × 844. Serviços e imagens simulados. Galeria, seleção e conversa permanecem no mesmo viewport. Imagens têm rolagem horizontal, históricos têm rolagem independente, e o compositor e a saída permanecem acessíveis. A pergunta atual vem primeiro no celular. Um portal preserva o texto não enviado e o controlador ao entrar e sair das referências do post.

Correções da inspeção: compactação do cabeçalho mobile, altura legível das imagens, pergunta antes do histórico no celular e contraste do texto secundário. O token secundário passou de #6e726f a #626762; axe-core 4.12.1 passou de 13 nós com contraste insuficiente para zero violações nos critérios WCAG A/AA auditados. Dois itens ficaram incompletos: controles do menu criados somente ao abrir o popup e a seta decorativa oculta de tecnologias assistivas. Conferidos manualmente, sem falha comprovada nesse estado. Auditoria automática não comprova conformidade integral nem operação num aparelho físico.

O detector Impeccable encontrou um aviso de borda lateral na recomendação já existente em studio-shell.css, mantida como parte da linguagem de leitura anterior e do exemplo aprovado. Nenhum outro achado determinístico nos sete alvos. PRODUCT.md ainda descreve o estudo de 23/10; as decisões atuais foram conferidas nos ADRs e na implementação, sem reescrever esse documento histórico nesta entrega.

Diferenças intencionais do mockup: dados e artes sintéticos; rótulos reais de escopo e respostas rápidas do contrato; preparação inicial termina na lista de posts vazia; somente o formulário confirmado cria a peça e recebe a v0. Nenhum título ou outro texto foi sobreposto aos pixels da arte.

Next MCP get_compilation_issues: lista vazia. Sem erro de página observado na navegação manual de Pinterest → propostas → lista vazia → nome → confirmação → v0 → referências do post → retorno.
