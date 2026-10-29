# Critérios para testar uma experiência criativa cativante

Proposta de protocolo local, em 29/10/2026. Não é resultado de teste, autorização de publicação ou demonstração de vendas. O objetivo é verificar se uma pessoa criadora, mesmo com uma ideia incompleta, recebe algo útil, reconhece sua autoria e relata uma experiência que deseja continuar. O designer e o engenheiro devem iterar a partir de objeções reais da pessoa simulada; não podem presumir que satisfação, aprovação da peça, surpresa ou silêncio sejam encantamento.

Este protocolo se aplica **a ensaios futuros**. Os critérios das avaliações anteriores permanecem como foram selados; por exemplo, a [terceira persona](terceira-persona-interacoes.md) aprovou a terceira peça, mas declarou que não ficou encantada e preferiu não insistir na quarta. O registro não pode ser reinterpretado como sucesso neste novo critério.

## Antes de cada ensaio

1. Um subagente no papel de pessoa criadora escolhe sua ideia, contexto, dificuldades, restrições e critérios de satisfação antes de ver propostas. Registra-os com data e hash, inacessíveis ao agente que conduz a conversa até a primeira avaliação. A fala inicial pode conter somente a ideia do curso. Não se instrui a persona a relatar surpresa, aprovar, compartilhar ou permanecer na conversa.
2. Fixar o briefing disponível ao produto, o ambiente e a versão do código, as ferramentas e modelos usados, consentimentos, fontes autorizadas, critério de encerramento e a regra de avaliação. Preservar horário, tempo decorrido, falhas e todas as versões geradas, inclusive as não escolhidas. Um arquivo selado depois de a persona ver uma peça não é pré-registro.
3. A pesquisa externa e o envio de miniaturas ao modelo dependem de autorizações separadas. Personalização, avaliação, compartilhamento e publicação têm suas próprias finalidades. Usar apenas dados fictícios em ensaios sintéticos; em estudos com pessoas reais, solicitar consentimento específico para avaliação. A pessoa pode recusar a pesquisa ou a memória e ainda receber um caminho sem referência.

## Colaboração durante o ensaio

- **Pessoa crítica:** expressa uma necessidade por vez, quando apropriado, e reage ao que efetivamente viu. Pode contradizer a hipótese do agente, rejeitar opções, interromper iterações, pedir para seguir sem referência ou dizer que algo é bom, porém não cativante. Sua fala é registrada separadamente da interpretação do agente.
- **Designer:** examina a peça e, sempre que possível, as miniaturas antes de saber sua ordenação; anota o recurso visual realmente observável, pertinência ao pedido, legibilidade e limites da resolução. Propõe alternativas que respondam à objeção específica, distinguindo inspiração por atributo de cópia ou licença. Não interpreta suas próprias notas como escolha da pessoa.
- **Engenheiro:** observa o caminho executado, identidade e autorização, se as ferramentas criaram artefatos de fato, versões, falhas, latência, tokens, cache e custo quando medidos. Propõe ou implementa a menor alteração necessária para resolver a objeção e verifica regressões. Não apresenta sugestão, SVG, simulação ou chamada mock como edição comprovada no produto.
- **Assistente:** transmite a escolha e os limites à pessoa, mostra a versão real e mantém a anterior recuperável. Quando o pedido já permite um rascunho, entrega-o sem repetir promessas ou reabrir decisões; faz perguntas necessárias e proporcionais. Em cada revisão preserva fatos e atributos não autorizados para alteração. Oferece desfazer quando uma mudança de perfil ocorreu, mas não guarda perfil sem consentimento.

O ciclo é objeção → análise do designer e do engenheiro → alteração executada e verificada → peça ou caminho demonstrável → avaliação independente da pessoa. Cada nova versão deve responder a uma hipótese identificável. Se a pessoa disser que prefere parar ou ficar com uma versão anterior, respeitar a decisão; não gerar mais rodadas para forçar uma nota de encantamento. O total de rodadas é medida, não justificativa para omitir trabalho necessário.

## Critérios observáveis por peça e por conversa

Após a pessoa examinar a peça efetiva, começar por uma pergunta aberta e neutra, como “O que funcionou para você e o que não funcionou?”. Preservar a resposta literal antes de perguntas específicas. Se necessário, apresentar uma escala de 1 a 5 com opção “não sei / não se aplica”; um resultado ausente permanece desconhecido. Não usar perguntas que sugiram a resposta esperada.

| Dimensão | Evidência necessária para o caso | Não equivale a |
|---|---|---|
| Clareza e autoria | A pessoa consegue dizer quem a peça busca alcançar, o que ela comunica e o que ainda não foi decidido; reconhece sua intenção e pode corrigir texto. | Prova de compreensão pelo público. |
| Fidelidade e segurança | Nenhum preço, data, canal, promessa, prova social ou condição é inventado. Referências têm origem e atributos selecionados; licenças e limitações são claras. | Garantia de direitos ou conversão. |
| Fluidez | Medir solicitações essenciais e extras, tempo até a primeira peça observável, revisões e erros; a pessoa relata se o percurso a ajudou ou atrapalhou. | Tempo economizado, se não houver comparação controlada. |
| Satisfação | A pessoa relata estar satisfeita com a peça **e** com o percurso, ou atribui nota ≥4/5 a cada um. Registrar condições e ressalvas. | Encantamento ou aprovação para publicar. |
| Encantamento e surpresa agradável | A pessoa descreve espontaneamente uma surpresa positiva ou, em pergunta neutra posterior, declara explicitamente que se sentiu encantada e atribui ≥4/5 à experiência. Se não observar surpresa ou encantamento, marcar não atingido ou desconhecido conforme a resposta. | Qualidade criativa comprovada ou reação de clientes. |
| Motivação para continuar | A pessoa relata vontade de dar um próximo passo concreto e viável e explica qual; se usar escala, ≥4/5. Nenhum clique, download ou silêncio é interpretado como intenção. | Compra, demanda ou sucesso comercial. |
| Vontade de compartilhar | A pessoa declara que gostaria de mostrar a peça a alguém, informa com quem e por quê, ou atribui ≥4/5 à vontade. Registrar se é hipótese ou ação efetiva. | Autorização para compartilhar ou publicar: ela é específica, separada e revogável. |
| Confiança comercial percebida | A pessoa afirma, sem indução, por que espera que a peça ajude a conversar com seu público sobre o curso, sua venda ou visibilidade, e indica ≥4/5 de confiança se a escala for usada. Registrar também dúvidas e condições. | Venda, alcance, impressões, cliques, interesse do público ou causalidade comprovados. |
| Produção e edição | A pessoa consegue ver o artefato, identificar textos e corrigi-los no caminho oferecido; uma nova versão é aberta e o original permanece. Identificar cliente, formatos, recursos necessários e o que foi realmente observado. | Editor visual completo, acessibilidade ou capacidade universal. |

Para classificação de **um caso simulado cativante**, exigir todas as evidências acima, nenhuma falha grave e declarações explícitas de satisfação, encantamento, surpresa agradável, motivação, vontade de compartilhar e confiança percebida. Notas não substituem fala sobre o motivo; uma pergunta específica serve para esclarecer, não para convencer. A aprovação de publicação só existe quando dada expressamente para um destino e conteúdo identificados, e a autorização de uma persona não autoriza uma publicação real.

Falhas graves incluem inventar fatos essenciais, expor conteúdo sem autorização, omitir que a referência é sintética, afirmar que o modelo viu pixels quando recebeu apenas metadados, ignorar rejeição registrada ou representar como editável uma imagem achatada sem caminho efetivo de edição. Se faltar evidência, registrar **não demonstrado**, sem completar pontuação com suposição.

## O que medir e como evitar conclusão indevida

Registrar por ensaio o número de turnos da pessoa e do assistente, perguntas adicionais, promessas sem entrega, pedidos de correção, primeira entrega, tempo decorrido, número de revisões, referências recebidas/pontuadas/mostradas, atributos aceitos ou rejeitados e opção sem referência. Nas fontes reais, conservar IDs, origens e hashes das prévias quando disponíveis; evitar atribuir um pin ao board sem prova. Avaliar a relevância de cada prévia com critério anterior à ordenação; relacionar precisão ou NDCG a notas do avaliador, não a aprovação da pessoa. Guardar as falhas, abstenções e mudanças de motor junto dos resultados.

Separar tempo da busca, roteamento, embeddings, classificação e geração quando houver instrumentação. Informar modelo efetivo, número de chamadas, tokens, cache **observado** e custo calculado apenas para os componentes com preço e uso conhecidos. Um ensaio isolado, o uso de prefixo comum ou uma estimativa não prova velocidade, economia ou benefício de cache.

Uma intenção declarada é expectativa. Vendas e visibilidade exigem, em etapa distinta, publicação autorizada, canal e janela definidos, métricas de público consentidas e observações verificáveis. Se não houver publicação ou medição, esses resultados são **desconhecidos**, não zero e não sucesso. Um teste de peça com pergunta para o público pode observar respostas, mas não comprova compras nem causalidade sem desenho apropriado.

Uma persona simulada pode fornecer um sinal de falha ou de sucesso **para aquele cenário**, não provar satisfação ou encantamento de todos os criadores. Para uma conclusão sobre produto, preparar casos reservados por pessoa e campanha, avaliações humanas independentes com consentimento específico e critérios definidos antes da coleta; apresentar ao mantenedor as falhas e os casos não resolvidos. **A promoção depende de avaliação humana**, sem prometer resultados comerciais ou criativos antes da evidência apropriada.
