# ADR 0075 — Revisão de candidatas a imagem antes da entrega

Candidata local de 18/11/2026. A revisão externa permanece desligada por padrão. A ativação exige decisão sobre tratamento de dados e orçamento, além da qualificação do revisor com imagens rotuladas de forma independente.

## Revisão da saída

O adaptador confere a estrutura e os dados descomprimidos do PNG candidato antes de enviá-lo ao revisor ou ao estúdio. A validação estrutural é local e também vale quando a revisão editorial está desligada. Arquivo truncado, frame animado ou candidato acima dos limites segue o contrato de resultado incerto da geração.

Em `COMPOR_IMAGE_QUALITY_REVIEW=required`, a composição do estúdio usa uma credencial de servidor dedicada em `COMPOR_IMAGE_REVIEW_OPENAI_API_KEY`. Configuração inválida impede novas gerações. As consultas de recuperação permanecem disponíveis. Com o modo ausente ou `off`, as rotas de geração seguem o fluxo anterior.

O revisor usa a Responses API com GPT-6.2 Sol, esforço `low`, saída estruturada e ferramentas desabilitadas. Envia o PNG candidato e o prompt da mesma operação. No post, separa os textos literais vinculados à proposta e já presentes no prompt para que prevaleçam sobre divergências do pedido criativo. A operação usa `store: false`, sujeito às condições de retenção da conta, sem incluir bytes de referência separados. Prompt e texto nos pixels são dados da revisão. O gerador e o revisor usam credenciais distintas. Cada candidata recebe no máximo uma revisão, de até 15 segundos. A aplicação tenta cancelar a chamada quando o pedido é interrompido. Cancelamento local não comprova ausência de processamento ou cobrança pelo provedor.

Integridade visual, texto obrigatório, fidelidade a fatos e direção específica precisam passar para que o adaptador libere os mesmos bytes recebidos. Reprovação exige evidência observável. Dúvida, erro, resposta inválida ou prazo esgotado retêm o PNG. O recibo diferencia `image_quality_rejected` de `image_quality_inconclusive`, conserva o uso conhecido da geração quando disponível e impede nova tentativa automática. Evidências textuais do revisor ficam fora dos recibos. [Rubrica e limites](../quality/pesquisa-ai-slop.md)

## Integração com reservas e recuperação

| Caminho | Desfecho da retenção |
| --- | --- |
| Arte e edição do post | A execução grava o desfecho vinculado à reserva e à versão original por uma prova vinculada ao pedido. O cliente pode consultar e encerrar a tentativa. O fluxo retém os pixels antes da gravação privada e não envia resultado de imagem ao agente. |
| Exploração serial e MCP remoto | A reserva do pedido confirma o desfecho `quality_held` com a prova existente. A galeria e a ferramenta podem informar a retenção. |
| Exploração paralela e reposição | O recibo fica no pedido da posição afetada. Os recibos dos irmãos preservam seus desfechos. O cliente interrompe novos lotes automáticos. Repor a posição exige um novo gesto e mantém o plano e a credencial originais do lote. |

As migrações `20261118000043` e `20261118000044` acrescentam a gravação e a leitura do desfecho, com verificação de identidade, vínculo, estado e prova. Gravação sem confirmação continua incerta. `rejected` na exploração continua reservado à recusa de credencial comprovada. O servidor revalida a autorização exigida antes da revisão e antes de liberar uma aprovação. O revisor não dá autoridade para criar, alterar ou salvar outra versão.

## Condições de ativação

Aplicar e verificar as migrações, definir o orçamento da credencial dedicada e obter autorização para o uso do PNG e do prompt na Responses API. A autorização atual cobre a geração. A ativação depende de informar a revisão com a credencial do Compor a quem usa a chave própria ou a IA do Compor. O teto operacional local limita chamadas e prazo por candidata. A fatura e o custo por tentativa precisam de validação própria. O uso da revisão não integra os contadores de geração nesta candidata.

Qualificar o revisor real com o [protocolo prospectivo](../../scripts/evals/qualidade-criativa/README.md). Medir escapes de obras inadequadas, retenções de imagens aceitáveis, indisponibilidade, latência e custo em estilos e pedidos inéditos. A peça aprovada pelo criador serve como regressão. O revisor avalia o PNG frente ao prompt da operação. Conferir a preservação da imagem-base em retoques, omissões do briefing e legibilidade após o recorte real exige materiais adicionais. A avaliação completa mede também briefing, voz e vontade de compartilhar. A retenção reduz a chance de entregar uma imagem inadequada e não oferece garantia estética sobre toda imagem analisada.

Em 19/11/2026, Matheus autorizou publicar e ligar o revisor após receber o resultado real de cinco acertos em seis cenários. A amostra registrou um escape de grafia e permanece como controle de regressão. A ativação segue o check de migrações e a credencial exclusiva de Production. Os controles existentes de autorização de geração informam o envio do PNG e do prompt ao revisor. [Resultado da rodada real](../evals/qualidade-criativa-2026-11-18/revisor-responses-2026-11-19.json)

Após a primeira retenção, desligar a revisão requer publicar a versão que reconhece `quality_held` com `COMPOR_IMAGE_QUALITY_REVIEW=off`. Os recibos e migrações permanecem legíveis. A versão anterior à migração desconhece o estado de retenção.

Este ADR complementa os [ADRs 0025](0025-prova-de-desfecho-da-exploracao.md), [0061](0061-lotes-paralelos-e-recibos-de-planejamento.md), [0069](0069-retomada-de-imagem-com-versao-fixa.md) e [0072](0072-triagem-visual-no-post-e-lote.md). A triagem do ADR 0072 continua a orientar referências e prompts de entrada.

## Adendo (23/11/2026) — `<ReviewDisclosureBadge compact />` expansível no compositor e em Referências

Por decisão de Matheus no plano aprovado em 23/11/2026 (Bloco 2, item 4), ajusta-se apenas a apresentação do aviso de transparência da revisão automática nas superfícies contínuas do estúdio:

### O que muda

- No compositor do chat (`StudioChat`) e na área de Referências (`ReferencePanel`) — bem como na barra inline de IA da Tela 1 (`Projeto e contexto`, [ADR 0044](0044-preparacao-guiada-e-estudio-por-post.md)) — o parágrafo integral permanente é substituído pelo selo expansível `<ReviewDisclosureBadge compact />`, renderizado como `<details>` recolhido por padrão com o resumo `"ⓘ Revisão automática de qualidade ativa · Como funciona"`.
- Um único clique expande o texto integral de transparência (informando o envio do PNG gerado e do prompt à OpenAI com a credencial de revisão do Compor e a possível retenção antes da entrega).

### O que permanece inalterado

- A exibição integral do aviso diretamente na configuração dedicada de escolha/conexão de IA e BYOK.
- Todo o contrato técnico e de privacidade da revisão: credencial dedicada no servidor (`COMPOR_IMAGE_REVIEW_OPENAI_API_KEY`) distinta da chave de geração (BYOK ou padrão), `store: false` sujeito às condições de retenção da conta, validação estrutural local do PNG, limite de 15 segundos por revisão, desfecho `quality_held` (`image_quality_rejected` / `image_quality_inconclusive`), bloqueio de repetição automática e ausência de autoridade do revisor para criar, alterar, salvar ou aprovar versões.

### Verificação

- Confirmar em testes de componente e navegador que `<ReviewDisclosureBadge compact />` inicia recolhido em `StudioChat` e `ReferencePanel`, expande em 1 clique revelando o texto integral e mantém o aviso completo na configuração de IA (implementação em curso na etapa correspondente).
