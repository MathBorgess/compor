# ADR 0021 — Exploração visual autônoma e sinais de gosto

- Estado: accepted
- Data: 06/11/2026
- Fonte: decisões de Matheus na revisão local do Compor em 06/11/2026.

> A cadência indefinida de lotes foi substituída em 06/11/2026 pelo [ADR 0024](0024-exploracao-limitada-e-pecas-flexiveis.md). O histórico abaixo preserva a decisão e a evidência anteriores.
>
> Em 09/11/2026, o [ADR 0029](0029-agente-opinativo-e-pergunta-unica.md) substituiu a forma do turno após a seleção, que deixa de apresentar opções e passa a ter uma leitura do gosto, uma recomendação e uma única pergunta.

## Contexto

O guia do estúdio apresenta cartões fixos e esboços SVG, enquanto a rota Phoenix usa catálogo e sinais sintéticos. A geração existente produz uma versão de peça; referências candidatas e imagens feitas para comparar ideias não são, por si só, versões aprovadas de uma peça. A entrevista do guia também não é uma conversa com IA.

## Decisão de produto

A conversa com o agente é o espaço principal do briefing. A pessoa pode explorar referências reais identificadas por origem e imagens exploratórias geradas, comparar alternativas contrastantes, comentar e escolher como prosseguir. Uma imagem encontrada, uma imagem escolhida para comparação e um recurso autorizado para gerar têm papéis distintos. As propostas visuais continuam sujeitas à decisão da pessoa e não equivalem à aprovação de uma peça.

Conectar a chave OpenAI autoriza a geração guiada pelo Compor durante a sessão. Inicialmente, Matheus escolheu geração contínua, sequencial e sem teto, com duas alternativas contrastantes no lote inicial. Na validação posterior de 06/11/2026, substituiu essa cadência por lotes sequenciais de três imagens, com espera visível de 15 segundos e a marca animada antes do próximo lote, para não sobrecarregar a pessoa; também pediu maior destaque à exploração de referências do Pinterest. A exploração para ao desconectar a chave, encerrar a sessão ou encontrar resultado incerto; não repete automaticamente uma operação incerta. A geração exploratória deve ser acessível no estúdio e no MCP. Essa decisão substitui, para a experiência do produto, a confirmação individual de geração descrita nos ADRs 0015 e 0020; ela não comprova que essas mudanças já estejam implementadas.

O feedback sobre referências selecionadas, tanto externas quanto geradas, acontece na conversa. Selecionar uma imagem não significa aprovar todos os seus atributos nem autoriza atribuir uma fala ambígua a uma referência específica.

Após cinco segundos sem mudanças na seleção, o Compor aguarda o chat ficar livre e apresenta uma interpretação do gosto com opções e recomendação para a pessoa confirmar. A iniciativa é do Compor, não uma fala atribuída à pessoa. A deliberação considera oferta, ação, perspectivas de criador e destinatário e ambiguidades relevantes; não exige um questionário completo. A confiança qualitativa baixa, média ou alta orienta, respectivamente, perguntas, alternativas com hipóteses e proposta de peça. Uma porcentagem só pode ser chamada de calibrada após avaliação com dados reais. Se a pessoa pedir a peça antes, o Compor pode prosseguir com suposições explícitas. Os lotes exploratórios são independentes dessa avaliação de prontidão.

O Phoenix deve utilizar escolhas, rejeições e comentários reais para adaptar sugestões. As inferências podem ser reutilizadas entre projetos da mesma pessoa e acompanhar sua conta em dispositivos distintos. Não há exigência de aviso proativo; a pessoa pode consultar e corrigir inferências quando pedir. Isso substitui a exigência anterior de aviso proativo sobre mudanças de preferência. Sinais escassos são hipóteses: sua existência não demonstra calibração estatística nem validação com público.

As imagens exploratórias também recebem escolhas e comentários explícitos, com histórico de correções e isolamento por conta e projeto. Seu plano composicional é registrado antes de chamar o fornecedor; não representa uma análise da imagem produzida. Nas próximas propostas, o planejador recebe comentários e planos associados aos sinais recentes da conta, sem presumir que uma reação à imagem aprove ou rejeite cada atributo. Referências externas alimentam separadamente a afinidade de boards do Phoenix. A persistência usa a migração `20261106000019_exploration_feedback.sql`; o acesso e a saída dependem da autenticação e do RLS configurados. Isso não comprova aprendizado semântico ou qualidade estética.

## Limites e verificação

Autorização por conta e projeto, sigilo da chave, vínculo da geração com seus insumos, reserva durável e recuperação de resultados incertos continuam necessários. Buscas externas, visualização de candidatos e envio de imagens a um modelo têm efeitos e permissões distintos. A persistência do perfil precisa de isolamento entre contas e de uma forma de correção.

Esta decisão de produto foi confirmada; sua implementação e verificação permanecem separadas. Testes com provedores simulados não demonstram geração paga, custos, implantação ou isolamento em serviços reais. A decisão não autoriza por si só uma chamada paga de teste nesta sessão.

O ADR 0019 continua registrando o comportamento sintético anterior; esta decisão o substitui apenas no que for implementado e verificado. O ADR 0020 permanece como histórico da composição anterior; esta decisão altera a hierarquia do briefing e substitui os cartões fixos quando implementada.
