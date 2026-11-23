# ADR 0081 — Imagens do carrossel na versão salva

**Implementado e verificado localmente.** Em 22/11/2026, o teste da revisão provou que a versão salva permite baixar novamente o ZIP no navegador que a criou. A nova sessão com IndexedDB vazio recupera a capa canônica pelo ADR 0077. O salvamento precisa vincular também as imagens das demais lâminas ao número exato da versão.

## Identidade e gravação

Para o salvamento explícito com imagens privadas habilitadas, o navegador congela um snapshot das lâminas e prepara os PNGs disponíveis antes de solicitar a nova versão. O identificador de cada imagem é estável para a combinação de projeto, peça, versão de destino, lâmina e SHA-256 dos bytes canônicos. O ID viaja em `content.frames[].assetId`, campo que já faz parte da versão salva pelo ADR 0080. O servidor continua exigindo identidade, propriedade do projeto e existência da versão para gravar ou ler cada PNG privado.

O CAS da versão fixa o snapshot. Se a resposta se perder, o estúdio pode adotar a versão achada somente quando o conteúdo e as identidades preparadas coincidirem. Cada imagem vai para o escopo da versão efetivamente salva. Um conflito de upload exige recuperar o objeto no mesmo escopo e conferir os bytes. O aviso de salvamento completo depende da confirmação de todos os PNGs preparados. O rascunho local permite completar uma operação interrompida com os mesmos bytes. Uma imagem ausente continua explícita numa versão incompleta.

## Recuperação e compatibilidade

Na reabertura, um dispositivo sem a cópia local lê só a referência da lâmina no snapshot e consulta a versão correspondente. O vínculo da primeira lâmina do ADR 0077 continua disponível para versões anteriores. Imagens antigas sem vínculo no escopo da versão só podem ser recuperadas por uma referência autoritativa. O download em ZIP depende de obter todas as imagens do plano.

O fluxo de geração e as versões históricas continuam lendo o contrato existente. O modo de imagens privadas desativado conserva o salvamento local. O limite atual do upload por PNG continua regendo o salvamento. Este desenho usa as tabelas e as políticas já aplicáveis ao salvamento de formatos e imagens privadas.

## Evidência exigida

Verificar um carrossel salvo em um contexto Chromium e reaberto em outro, com IndexedDB vazio. Conferir as identidades por lâmina, os hashes dos PNGs no ZIP, a legenda, a recuperação de falha parcial com os mesmos bytes e o tratamento de conflito sem adotar um snapshot divergente. O teste a 390 px recuperou os cinco PNGs originais e a legenda num contexto Chromium novo. Ele também confirmou a recuperação do mesmo número de versão após uma falha parcial. O teste HTTP usou a rota Next com o armazenamento simulado. A evidência local usa serviços simulados. Uma publicação exige verificação da API e do Storage da própria revisão publicada.
