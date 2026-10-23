# Debate de reestruturação do Compor — mandato e categorias

Pedido de Matheus em 23/10/2026, na conversa Codex `01a16870-d59e-7511-97c5-beee1c6524b6`: registrar envios e relatos em documentos separados; criar subagentes por categoria de usuários satisfeitos/insatisfeitos e papéis de UX/Product Design e CEO com Revenue-Centric Design; debater produto, negócio, KPIs e métricas; registrar o fluxo e consolidar uma spec com `to-spec` no repositório e documentação no Google Docs.

## Fronteira da evidência

Os participantes abaixo são **subagentes simulando perspectivas**, não os autores reais das fontes nem clientes entrevistados. Não podem inventar desejos, respostas, pagamento, frequência ou consenso humano. Cada posição deve citar IDs do corpus e separar fonte, inferência e proposta. A síntese representa um desenho candidato resultante da pesquisa e do debate, não PMF validado.

Base: [dossiê de 67 registros](../../pesquisa/2026-10-23-voz-do-cliente/README.md), [relatos estruturados](../../pesquisa/2026-10-23-voz-do-cliente/relatos.json), [primeira onda de contatos](../../prospeccao/2026-10-23/README.md), [persona de 22/10](../../persona-e-posicionamento.md), [produto](../../produto.md), [v0](../../compor/experimento-v0.md) e [arquitetura](../../arquitetura.md).

## Categorias registradas

Categorias descrevem padrões de trabalho, não grupos estatísticos exclusivos. Uma pessoa real pode transitar entre elas. Os exemplos não demonstram que todos sejam solo, Mac, brasileiros ou compradores do Compor.

| ID | Categoria / posição | Relatos de ancoragem | Tensão que deve representar |
|---|---|---|---|
| A1 | Voz e autoria exigem revisão — insatisfeito | EN01, AD06, PD01; contrapontos PO03/PO04 | Reescrever pode ser esforço indesejado ou decisão autoral; automação não deve apagar voz |
| A2 | Execução visual e escolha bloqueadas — insatisfeito | EN03, PT01, PT03, DR04, DR05; contrapontos DR02/DR08 | Integrar pode ajudar, mas excesso de rotas, templates e importação pode deslocar o trabalho |
| A3 | Material pronto, aquisição incerta — insatisfeito/misto | PT04, PT05, PT06, EN07, PO01; contrapontos PO09/PO10 | A maior prioridade pode ser oferta, canal, confiança ou público, fora de um editor |
| A4 | Processo atual suficiente — satisfeito | PP01, PP03, PO03, PO06, DR08 | Valoriza controle, método e ferramenta conhecida; precisa de motivo concreto para mudar |
| A5 | Vende, mas precisa sustentar resultado — satisfeito/misto | PO02, PO07, PO08, PO09, PO10, PO12 | Base própria e simplicidade funcionam; custo, esforço e plataforma permanecem riscos |
| D1 | UX e Product Design | Todas as categorias e Revenue-Centric Design | Converter prioridade em jornada, escolhas, estados, aceites e teste de valor |
| B1 | CEO / estratégia e negócio | Todas as categorias e Revenue-Centric Design | Delimitar comprador, oferta, unidade econômica, distribuição, KPIs e critérios de parar |

## Protocolo do debate

1. **Posições independentes:** cada arquétipo escreve o que preservaria, o que rejeita, suas três prioridades, contrapontos, critério observável de valor e pergunta para os demais. UX e CEO aplicam a skill e propõem um desenho a partir das fontes.
2. **Contestação cruzada:** todos recebem as posições e respondem a objeções identificadas por autor/ID. Registrar o que mantiveram, mudaram e por quê. Discordâncias não desaparecem por votação.
3. **Consolidação:** UX e CEO refinam a proposta; o moderador registra decisões candidatas, alternativas rejeitadas, dores priorizadas, lacunas e experimentos. Os arquétipos têm a última oportunidade de apontar contradição material.
4. **Spec:** sintetizar o debate com `to-spec`, histórias de usuário, decisões de implementação e teste, escopo excluído, modelo de negócio e métricas operacionais bem definidas.

Os limites de concorrência permitem três agentes ativos além do moderador. Rodadas podem ocorrer em lotes; as réplicas dependem de leitura das posições registradas, não de simultaneidade. Timestamps e artefatos documentam a sequência real.

## Direções anteriores e limites do mandato

Matheus já definiu macOS/Electron, preservar voz/fatos, exploração criativa e conta ChatGPT/Codex com acesso oficial antes da venda. O debate pode contestar hipóteses de recorte, quantidade de rotas, promessa, jornada e monetização; mudanças em decisões técnicas do dono devem aparecer como propostas explícitas. Não há autorização para implementar, cobrar, publicar anúncios ou prometer beta nesta etapa.

Promessas de CTR/CPA melhores, faixas de receita, urgência universal e tempos de produção da persona são hipóteses que o corpus não validou. O debate deve desafiá-las. O objetivo é reduzir incerteza de produto, sem transformar simulação em evidência de mercado.

## Skills aplicadas

- `revenue-centric-design`, fonte Richard (@richardrx), revisão upstream fixada `1942760c2242f609bf63ce2c97204f5a1791bd68`; termos preservados no [histórico RCD](../2026-10-20-rcd/RCD-LICENSE.txt). Os dois papéis de produto/negócio devem citar princípios específicos e suas fontes. Estudos citados pelo playbook não são resultados do Compor.
- `to-spec`, catálogo local mattpocock-skills 1.3.1: síntese da conversa, histórias extensas e teste de comportamento externo. Não há implementação existente a testar; a spec deve distinguir ensaio documental, protótipo futuro e teste com pessoas.

## Documentos de entrada separados

- Documento 1: [primeira onda — mensagens e e-mails](../../prospeccao/2026-10-23/README.md), com conteúdo individual nos arquivos vinculados.
- Documento 2: [relatos identificados](../../pesquisa/2026-10-23-voz-do-cliente/README.md), com corpus, satisfeitos e contrapontos.

Os links e verificação dos Google Docs serão registrados ao final da escrita, sem ampliar compartilhamento automaticamente.
