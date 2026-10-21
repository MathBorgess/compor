# Compor v0: oferta gratuita, oferta paga e pré-venda

20/10/2026. Matheus definiu uma v0 com teste A/B, comparando oferta gratuita e paga. Ele também propôs investigar venda antes da estabilidade. Esta entrega descreve o experimento; recrutamento, publicação e cobrança continuam futuros.

## O que testar

A v0 procura pessoas com uma tarefa urgente e testa aceitação de preço. A V1 continua como alvo de produto descrito na spec. A primeira oferta pode identificar explicitamente uma pré-venda ou um beta, versão ainda em teste.

A hipótese principal é que parte do público aceite pagar para criar e atualizar a divulgação do próprio curso. A oferta gratuita ajuda a observar uso e dificuldades. Cadastro gratuito, isoladamente, mede interesse. Urgência, conclusão e retorno ajudam a identificar necessidade real.

O acesso oficial continua anterior à venda, conforme a decisão de Matheus. A proposta preserva uso do plano ChatGPT sem pagamento obrigatório ao aplicativo. Cobrar pelo editor ou entrega exige confirmar a separação permitida. A [arquitetura](../arquitetura.md) registra esse requisito.

## Dois modos possíveis, em rodadas separadas

**Pré-venda:** o aplicativo ainda depende de construção ou estabilização. A oferta explica entregável, recursos ausentes, previsão de entrega e condições de cancelamento ou devolução. A equipe precisa assumir uma data concreta antes de aceitar pagamento. Sem data e condições viáveis, registrar interesse sem cobrar.

**Beta disponível:** existe uma versão para executar a tarefa delimitada. A oferta mostra limitações e suporte. A experiência pode exigir ajustes, mas precisa preservar dados e recursos. Testar recuperação, exportação e permissões antes de entregar conteúdo real.

Escolher um modo antes da rodada. Misturar pré-venda e beta entre os braços confundiria preço com disponibilidade do produto. A venda de beta pode anteceder estabilidade geral; a comunicação deve apresentar esse estado com clareza.

## Protocolo proposto

Proposta inicial: uma rodada de 14 dias ou dez qualificados, o que ocorrer primeiro. Esse limite controla esforço; ele carece de poder estatístico demonstrado. A equipe registra amostra e incerteza antes de concluir.

Qualificar pessoas com o mesmo perfil: dono solo de curso já vendido, Mac, divulgação em até 14 dias e duas mudanças recentes. Pedir fatos e material autorizados. Registrar o prazo da tarefa antes de atribuir a condição.

Depois da qualificação, sortear uma condição por pessoa. Usar blocos de duas atribuições, uma gratuita e uma paga, em ordem sorteada. Preservar a condição em retornos e evitar duplicar pessoas na contagem.

| Condição | Preço candidato | Entrega e suporte |
| --- | ---: | --- |
| A: gratuita | R$0 | Mesmo escopo, prazo, limite de revisão e suporte do braço pago |
| B: paga | R$199 | Mesmo escopo; pagamento ou pré-venda conforme o modo escolhido |

O plano comercial propõe R$199, sem aprovação do autor para oferta real. Matheus escolheu testar cobrança e gratuidade; o valor específico permanece para avaliação. A equipe define preço, limite de suporte e condições antes de abrir a rodada.

Manter iguais mensagem, canal, material, suporte e janela de observação. O preço constitui a diferença planejada. Informar que as condições pertencem a um experimento. Registrar diferenças de canal, prazo ou familiaridade que escaparem ao controle.

A pesquisa de uso exige consentimento separado da compra. Quem recusa participar do estudo mantém sua entrega contratada. A coleta registra somente os dados necessários e um prazo de descarte.

## Métricas e denominadores

| Medida | Numerador | Denominador e limite |
| --- | --- | --- |
| Aceitação da oferta | Pessoas que confirmam condições | Qualificados atribuídos ao braço |
| Uso inicial no beta | Pessoas que concluem a primeira tarefa | Qualificados atribuídos ao braço com beta disponível |
| Entrega na pré-venda | Compradores que recebem o combinado | Compras com prazo de entrega vencido |
| Pagamento | Transações confirmadas | Ofertas pagas apresentadas |
| Retorno | Pessoas que concluem nova tarefa | Pessoas com nova ocasião observável |
| Devolução | Compras devolvidas | Compras confirmadas |

Na pré-venda, a primeira tarefa ainda indisponível recebe estado pendente. Separar indisponibilidade de abandono. A confirmação gratuita difere do compromisso financeiro; comparar contagens sem atribuir igual força aos sinais.

Registrar também receita líquida por qualificado, custo por braço, ajuda, tempo e motivo de recusa. Incluir suporte gratuito no custo do experimento. Contar apenas custos dos compradores esconderia o custo das pessoas que recusaram ou usaram gratuitamente.

## Como interpretar

O teste compara duas ofertas, mas dez pessoas permitem apenas aprendizado exploratório. Mostrar contagens, taxas e incerteza. Resultados pequenos dispensam declarar preço validado ou vencedor estatístico. Qualquer teste confirmatório exige planejar volume e efeito mínimo antes da coleta.

Mais inscrições no gratuito podem indicar curiosidade ou menor atrito. Conclusão e retorno mostram se a pessoa usa o resultado. Pagamento confirma aceitação daquela oferta; devolução e custo podem mudar sua avaliação.

Antes da rodada, registrar duração, preço, critérios, métricas e motivos de parada. Evitar encerrar antecipadamente só porque uma taxa parece favorável. Uma falha crítica, condição comercial descumprida ou risco de perda exige interromper a entrega afetada.

## Sustentabilidade desde a primeira oferta

Cobrar cedo mede aceitação, sem garantir recuperação do investimento. O [plano comercial](negocio-e-gtm.md) separa contribuição por venda de recuperação do desenvolvimento. O braço gratuito também consome suporte, distribuição e aquisição.

Registrar dinheiro recebido, taxas, devoluções e horas reais. Somar custos compartilhados uma vez e explicitar sua alocação entre braços. Comparar a contribuição acumulada com o investimento ainda por recuperar.

Antes de abrir a rodada, fechar teto de gasto, horas, vagas, suporte e responsável. Uma oferta com custo acima do benefício observado exige revisar público, tarefa ou escopo. A cobrança, sozinha, deixa essa conta em aberto.

## Evidência e próxima decisão

A entrega do experimento deve trazer critérios, sorteio, versões da oferta, contagens por braço e custos. Acrescentar pagamentos confirmados, devoluções, ajuda, materiais e retomadas quando existirem. Os resultados atuais permanecem desconhecidos.

Depois, decidir entre repetir com hipótese revisada, ampliar pesquisa ou encerrar a oferta. Avançar para V1 exige evidência de tarefa, operação e economia. O experimento preserva a criação narrativa e visual como núcleo do produto.

Método: **Revenue-Centric Design, Richard (@richardrx)**, com [termos integrais](../debate/2026-10-20-rcd/RCD-LICENSE.txt). A proposta respeita a decisão do autor pelo A/B e mantém [limites de pequenas amostras](https://x.com/richardrx/status/2061463480868229189) explícitos.
