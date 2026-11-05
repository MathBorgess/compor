# Exportação da arte integral

Desde a decisão registrada no [ADR 0012](../../../docs/adr/0012-arte-integral-e-deliberacao-adaptativa.md), o GPT Image produz a arte inteira, incluindo os textos. O app mantém título, preço e data como instruções para uma próxima geração. Alterar esses campos não modifica pixels da imagem atual. A legenda continua separada.

`composePng({base})`, usado pelo editor legado, valida o PNG e devolve os mesmos bytes, sem recortar nem adicionar elementos. Limita entrada a 8 MiB e dimensões a 64–2048 pixels. Verifica estrutura, quantidade e tipos de chunks antes de decodificar; recusa metadados comprimidos. A filtragem pode rejeitar PNGs legítimos. Uma decodificação por vez reduz concorrência e não comprova segurança do decodificador.

O Studio usa `composeStudioPng({base})`. Um PNG permanece idêntico; JPEG autorizado é convertido integralmente para PNG nas dimensões originais, sem texto, gradientes ou recorte. O armazenamento do Studio valida os bytes e vincula a imagem à conta, projeto, peça e versão. Novas gerações preservam as anteriores.

Os testes `composition-browser.test.mjs`, `compose-ui-browser.test.mjs` e `studio-flow-browser.test.mjs` comparam bytes ou pixels e verificam isolamento. O gate de navegador exige Chromium presente, impedindo uma aprovação baseada em testes ignorados. As fixtures são sintéticas; não demonstram qualidade visual ou legibilidade de uma imagem real do fornecedor.
