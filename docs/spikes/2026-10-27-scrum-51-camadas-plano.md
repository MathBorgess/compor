# Spike SCRUM-51 — plano prévio: camadas e crítica

**Plano registrado antes da execução dos testes deste spike, 27/10/2026.** A pessoa aprovou usar recorte e visão geral, pediu criação de elementos do criativo em camadas via MCP e seleção por área ou clique em camada. Este é um experimento sintético local; não autoriza por si só publicar dados, usar credenciais ou executar geração paga. A arquitetura v0 permanece a referência de permissão e escopo.

## Hipóteses

- H1: um plano estruturado com camadas de imagem, formas e texto, com geometria e ordem, possibilita relacionar uma crítica ao elemento certo sem regenerar o texto ou confundir valor e tamanho.
- H2: marcação por área preserva a região e pode identificar mais de uma camada candidata; clique por camada preserva o alvo explícito.
- H3: alvo da crítica e alcance da memória são dimensões distintas; eventos locais e hipóteses revisáveis não se propagam automaticamente a outras variações, produtos ou campanhas.
- H4: recorte e visão geral ajudam a transmitir contexto, mas não serão testados com modelo nem pessoas neste experimento.

## Três casos e critérios

1. **Preço:** criar peça sintética com fundo, título, preço `R$ 99` e CTA em camadas. Clique em preço e nota “aumentar a fonte” deve preservar o alvo e o valor literal. Um pedido “aumentar o preço” continua semanticamente ambíguo; sem modelo ou interface não há conclusão automática sobre a intenção.
2. **Fundo:** selecionar região normalizada sobre fundo com nota “mais leve”; preservar versão, região e possíveis camadas atingidas, incluindo sobreposição. Não reivindicar alteração de pixels, inpainting ou preservação do resto da imagem.
3. **Lote:** dois alvos, elogio da paleta e rejeição da fonte; preservar notas e alvos em ordem, sem atribuir sinal negativo à peça inteira ou escopo amplo. Testar versão divergente, alvo inexistente, coordenadas fora dos limites e conteúdo não confiável.

## Regras de interpretação

Uma estrutura de camadas não demonstra imagens criadas por IA em arquivos transparentes separados, segmentação de PNG ou editor Figma/Canva. O caminho de validação requer chamadas ao MCP real, entrada sintética e resultados reproduzíveis. Atribuições de escopo ou autoria recebidas pelo protótipo são alegações do cliente; não comprovam consentimento nem persistem memória. Sem testes com modelo, usuário ou Supabase, não alegar que a crítica alterou preferências reais, que o cliente enxergou uma prévia ou que o agente melhorou o resultado.

Escopos de alvo (camada, variação ou peça) não são sinônimos de memória (tarefa/campanha, produto, marca ou organização). A v0 permite hipótese proativa reversível em tarefa/campanha e não autoriza propagação automática para marca/organização; a política de ampliar escopo é decisão pendente. Preferências confirmadas não são sobrescritas por hipótese. Evals e conteúdo dependem das permissões previamente estabelecidas.
