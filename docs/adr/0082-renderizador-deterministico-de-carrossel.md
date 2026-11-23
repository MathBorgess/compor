# ADR 0082 — Renderizador determinístico de carrossel

O ADR 0080 documenta a geração de arte integral. O ADR 0081 vincula os PNGs dessas lâminas às versões. O renderizador de carrossel introduz uma composição adicional para planos em que o texto e os elementos visuais têm papéis distintos.

## Porta de integração

O laboratório e a rota Node do estúdio compartilham os arquétipos do pacote `@compor/carousel-renderer`. A rota `POST /api/studio/carousel/render` fica disponível com `COMPOR_CAROUSEL_RENDER_ENABLED=true`. Exige a origem do aplicativo, uma sessão autenticada e a propriedade do projeto. Recebe um único plano JSON pequeno com texto, paleta e diagramas parametrizados. O servidor valida os campos e limita a geração a uma composição simultânea por processo. O Chromium opera com rede bloqueada, fontes empacotadas e DPR 2. O Sharp normaliza as saídas em JPEG 1080 × 1350, sRGB, 4:4:4 e não progressivo.

O pedido compõe em memória. O ZIP preserva os JPEGs compostos, a legenda, o alt text e os artefatos de diagnóstico físico. Os hashes no manifesto ligam o plano e os arquivos daquela resposta. Uma falha física bloqueia o ZIP. O manifesto e a rota cobrem a validação determinística da composição. Gate 0 editorial, evidências de origem e avaliação de coleção completa são contratos da geração e da promoção.

## Adoção pelo estúdio

O compositor e a rota são a primeira etapa da integração. A conversa ainda segue o plano de lâminas e a geração dos ADRs 0080 e 0081. Para aceitar um plano composto no estúdio, a ação de render precisa reunir uma revisão congelada da peça, a cópia autorizada e eventuais referências de arte limpa com identidade e hashes separados. Edições de copy, ordem, tema ou referências invalidam o vínculo com a composição anterior. Somente os bytes da composição da revisão atual podem ser salvos como o novo produto final.

Os artefatos de uma versão seguem o contrato canônico que os gravou. Estender o salvamento para JPEGs requer um contrato de leitura e escrita que preserve seus bytes e a recuperação em outra sessão, incluindo resultado parcial e repetição idempotente. Dados e permissões dos projetos continuam sob a autoridade do servidor e das políticas existentes.

## Evidência para habilitação

Executar o fluxo autenticado da rota em Linux no Preview da Vercel. Verificar o fechamento do Chromium em falha, os arquivos presentes no trace, o orçamento de tamanho do ZIP e o comportamento para planos recusados. Vínculo à versão e recuperação em outro navegador exigem mais uma verificação depois que o estúdio consumir esse contrato.

Em 23/11/2026, uma prévia de diagnóstico compilou o código de render de `1a2e261` com um `postbuild` restrito à sua branch. O log registrou Linux x64, Node 24.22.3, 556 entradas no trace da rota e dez arquivos conferidos, incluindo Chromium Brotli, bibliotecas do Sharp e as fontes. Passaram nove testes, incluindo extração a frio, captura Chromium em 2× com Sharp e fechamento do navegador. A chamada autenticada da Function publicada e seu comportamento sob os limites de runtime ainda precisam de evidência. [Commit do canário](https://github.com/MathBorgess/compor/commit/c4e3bd1bc5a6c72c86a46d12dc2529788009de15) · [Build de diagnóstico](https://vercel.com/math-ai2/compor/9m7wWFxyQaaoMuCh7dGFGLrTqcP8)
