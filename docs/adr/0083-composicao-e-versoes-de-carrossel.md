# ADR 0083 — Composição e versões de carrossel

A conversa pode propor um plano tipado com arquétipo, alt text e slots visuais por lâmina. A revisão compõe o plano quando a pessoa solicita. Fonte, cor, diagrama e texto são dados do plano. A rota usa os recursos já empacotados no servidor. O primeiro fluxo integrado compõe texto e diagramas e permanece sob a flag do ADR 0082.

## Vínculo entre cópia, render e versão

O estúdio materializa o pedido a partir das lâminas atuais e confere o digest do plano no manifesto, os IDs em ordem e o SHA-256 de cada JPEG. A rota oferece essas partes em multipart para o editor e ZIP para download direto. A revisão só adota a composição quando a peça, a versão-base e o plano continuam atuais. O navegador guarda os bytes temporários em endereços derivados do conteúdo. Confirmar nova cópia, mudar a ordem ou substituir o plano invalida a composição da revisão. A versão anterior conserva a sua composição.

Ao salvar, o CAS da peça grava `carouselPlan` e `carouselRender` junto aos IDs dos JPEGs daquela versão. A rota de imagens privadas revalida identidade, versão, IDs e hashes. A extensão `.jpg` exige vínculo explícito no conteúdo da versão. Um bucket privado separado limita o MIME a JPEG e preserva o bucket PNG. A rota valida o perfil do arquivo antes de gravar. A leitura mantém os bytes e verifica o hash. O vínculo permite conferir os bytes frente à versão. O manifesto físico da rota e a evidência da bancada representam verificações próprias. A capa do carrossel usa a primeira lâmina. O contrato da capa PNG do ADR 0077 continua aplicável às versões que a usavam.

Falhas parciais mantêm o rascunho da composição e permitem repetir a publicação com os mesmos endereços e bytes, após reconciliação do CAS. A revisão usa o tipo de cada artefato para o download individual e o ZIP. A autorização para compor é distinta da autorização para salvar e da solicitação de geração de imagem.

## Evidência de habilitação

Verificar atualização e descarte por troca do plano, validação física em Chromium, upload parcial, reabertura em outro navegador sem cache, ZIP JPEG e leitura dos PNGs legados. Em Linux, confirmar a abertura do Chromium empacotado e a execução no Preview. Gate 0 editorial, direção de arte limpa e promoção por avaliação continuam regidos pela especificação de carrosséis.

## Evidência local

Um fluxo em Chromium a 390 px registrou o plano pelo WebMCP, compôs a prévia por gesto explícito e invalidou o render ao editar a manchete. Interromper o segundo upload permitiu retomar a mesma versão. Um contexto de navegador sem cache recuperou os JPEGs, a legenda e os textos alternativos. O teste usou HTTP simulado para renderização e Storage. Os testes PGlite verificaram o CAS, o digest do plano, a ordenação, o acesso pelo proprietário, o bloqueio de outra conta e o comportamento PNG.

O analyzer capturou as 52 rotas entre o commit `74b8ecb` e a primeira integração. O gzip de todos os JS emitidos subiu de 298.436 para 303.807 bytes. A resposta multipart, o contrato de slots compartilhado e o filtro de App Router desabilitado reduziram o total para 302.535 bytes. O orçamento continua em 300.000. A execução do Chromium Linux x64 sob QEMU confirmou o hash e a versão do binário. A sessão de render perdeu o processo por memória na primeira tentativa e por `SIGSEGV` na segunda. O Linux nativo do Preview continua pendente de validação.

Em 23/11/2026, agrupar composição, assets por lâmina e ZIP no chunk do estúdio sob demanda reduziu o gzip para 301.052 bytes. A preparação do ZIP continua no clique. Os metadados estáticos passaram a ser emitidos no documento e a aplicação adotou páginas de erro pequenas. O build preservou o status, o título, a mensagem e a geração estática da 404. O bundle completo ficou em **298.934 bytes gzip** em macOS com Node 24. Os testes HTTP conferiram os caminhos públicos de autenticação e OAuth e a recusa de acesso direto à rota interna. O experimento de mover rewrites para o Proxy retornou 404 em OAuth e foi descartado.

## Evidência da camada de arte

No laboratório, o renderer confere o formato declarado ao decodificar cada raster de uma página. Ele registra as dimensões e o SHA-256 da fonte e o SHA-256 do PNG normalizado que entrou na composição. A folha `art-sheet.jpg` mostra cada imagem antes do scrim, com proporção preservada e sem recorte. O diagnóstico associa cada tile ao ID e à posição da lâmina.

A bancada exige um parecer vinculado aos hashes do plano, da folha e do recibo do renderer para promover um deck com raster. Um canário local em Chromium exibiu duas palavras nas extremidades de uma imagem larga. O Tesseract 5.5.0 leu as duas na folha, e o parecer registrou `TEXT_IN_ART_LAYER` com as respectivas regiões na lâmina 2. A revisão de rostos e a calibração do juiz visual seguem pendentes.

A rota do estúdio recebe apenas os slots do plano editorial. O artefato de diagnóstico prepara a revisão das fontes raster do laboratório. A adoção de raster pelo estúdio requer uma origem autorizada por lâmina e vínculo com o plano e a versão.
