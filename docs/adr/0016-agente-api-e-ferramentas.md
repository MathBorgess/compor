---
status: recorded
date: 2026-11-05
---

# Agente gerenciado e ferramentas com autoridade limitada

## Contexto e registro

O código atual de `packages/agents-api` chama a OpenAI Agents API em `/v1/agents/sessions`. Ela gerencia sessão e turno. O backend acompanha itens, valida propostas, atende ferramentas e reconcilia resultados. Não usa Agents SDK para executar o loop do estúdio. O SDK presente no protótipo serve aos experimentos locais.

Este registro solicitado em 05/11/2026 documenta o código. O [ADR 0011](0011-agents-api-e-mcp-remoto.md) mantém seu status histórico `proposed`; não é promovido a aceito por este documento.

## Contrato atual

As function tools do estúdio estão em `studio-chat-tools.mjs`. Ações locais passam pela ponte `studio-tools.ts`; mutações duráveis são verificadas nas rotas do servidor, inclusive ao aceitar o recibo de uma ação. Uma resposta do modelo ou uma alegação do navegador não comprovam que houve alteração durável.

`generate_image` prepara uma proposta. A confirmação humana congela a operação de imagem antes de chamar a Images API: prompt, textos literais, imagens, origem e destino participam do vínculo. O gerador produz a arte completa. A aplicação no navegador e o armazenamento são etapas verificadas separadamente.

O agente usa instruções compartilhadas de `packages/agile-deliberation`. Ele esclarece ambiguidades com exemplos/contraexemplos e pode propor critérios. Não aceita critérios em nome do criador. Perspectiva do destinatário continua hipótese, mesmo quando o criador decide adotá-la. Os [ADRs 0012](0012-arte-integral-e-deliberacao-adaptativa.md) e [0013](0013-agile-deliberation-no-mcp.md) definem o método e seus limites.

## Consequências e verificação

Ferramentas têm schemas, escopo e resultados correlacionados à tentativa. Conteúdo criativo não redefine permissões. Uso e custo ausentes permanecem desconhecidos. O frontend não armazena a chave para concluir trabalho depois que a sessão deixa de estar disponível.

Testes de agentes simulam o fornecedor e verificam chamadas, consentimento, vinculação, recibos e falhas. Não comprovam qualidade do raciocínio, resultado criativo, custo real ou disponibilidade da API para uma conta. Avaliações pagas e provas reais precisam de escopo e evidência próprios.
