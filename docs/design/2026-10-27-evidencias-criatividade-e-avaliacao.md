# Evidências para estudar criatividade e valor no Compor

**Levantamento de 27/10/2026.** Estes estudos fundamentam hipóteses e escolhas de avaliação; nenhum testou o Compor. Seus resultados não demonstram ganho de produto, justificam cobrança ou substituem pesquisa com as pessoas que usarão o aplicativo. A [proposta de skills, tools e evals](2026-10-27-skills-tools-evals-proposta.md) mantém decisões e casos separados de evidência observada.

## Novidade, utilidade e marca não são a mesma medida

Em um [estudo de Fu e colegas, CHI 2026](https://www.microsoft.com/en-us/research/publication/decoupling-of-usefulness-and-novelty-evaluating-the-impact-of-generative-ai-on-design-outputs-and-novice-designers-creative-thinking/), 36 participantes criaram anúncios com e sem IA generativa. Clientes e avaliadores online perceberam os resultados com IA como mais criativos e incomuns. Os avaliadores online, mas não os clientes, também os consideraram mais atraentes. Nenhum dos dois grupos percebeu diferença em utilidade, e os clientes não perceberam melhora no alinhamento à marca.

**Limite:** trata-se de um experimento de design com participantes e tarefas específicas, não do Compor nem de desempenho de campanha. Ausência de diferença detectada não demonstra que as condições são equivalentes para todos os usos.

**Implicação proposta:** pedir avaliações separadas de novidade, utilidade para a tarefa e alinhamento à marca/intenção. A pessoa responsável pela tarefa deve poder dizer que algo é diferente, mas inadequado; observadores externos não substituem sua avaliação. A utilidade e a conclusão permanecem distintas de likes e downloads.

## Apoio individual pode coexistir com menor diversidade coletiva

[Doshi e Hauser, Science Advances 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244532/) distribuíram 293 autores entre condições de escrita de histórias curtas sem IA ou com acesso opcional a uma ou até cinco ideias geradas. As histórias com apoio de IA foram avaliadas como mais criativas, melhor escritas e mais agradáveis, especialmente entre autores com menor pontuação inicial na medida usada; também apresentaram maior semelhança entre si. A avaliação reuniu 600 leitores e 3.519 avaliações.

**Limite:** microficção em condições de pesquisa é diferente de uma campanha visual. O resultado não significa que toda IA reduza diversidade em qualquer tarefa, nem que a semelhança medida seja uma preferência da pessoa.

**Implicação proposta:** observar tanto a qualidade para cada pessoa quanto a diversidade entre alternativas e entre trabalhos, quando houver dados suficientes e autorização. Semelhança automática pode servir de sinal exploratório, não de julgamento único de utilidade ou originalidade. A v0 pode começar com comparação humana do par efetivamente exibido.

## Uma primeira referência também pode ancorar a exploração

Em um [experimento de ideação visual com 60 participantes](https://arxiv.org/abs/2403.11164), Wadinambiarachchi e colegas observaram maior fixação no exemplo inicial entre participantes com apoio de geração de imagens; nesse experimento, o grupo com IA produziu menos ideias e menor variedade e originalidade do que o baseline. A tarefa era criar um avatar de chatbot em condições controladas, com exposição a um exemplo.

**Limite:** a configuração de laboratório e o estímulo não correspondem ao fluxo real do Compor. O estudo não prova que duas alternativas resolvam fixação nem que explorar mais seja sempre melhor.

**Implicação proposta:** observar se a primeira proposta restringe escolhas posteriores; permitir rejeitar todas, variar dimensões e voltar à intenção. Comparar o fluxo com e sem alternativas em tarefas equivalentes quando houver capacidade de estudo, registrando custo, tempo e esforço de decisão. A escolha de oferecer duas direções no início da exploração já foi tomada; seu benefício continua hipótese.

## Referências e palavras podem apoiar recombinação

O [CreativeConnect](https://arxiv.org/abs/2312.11949) investigou descoberta e recombinação de elementos de referências com palavras. Após estudo formativo com seis pessoas, um estudo com 16 participantes apontou mais ideias e maior criatividade **autorrelatada** em comparação com o sistema de referência usado pelos autores.

**Limite:** o estudo tratou de ideação gráfica em tarefas delimitadas; mais ideias ou autorrelato não provam utilidade para uma campanha real nem qualidade final. Não demonstra que o Compor deve instalar esse sistema.

**Implicação proposta:** examinar se rótulos, palavras e atributos editáveis ajudam a pessoa a especificar o que quer aproveitar de cada referência. Medir se o fluxo permite corrigir interpretações, combinar ou rejeitar elementos; não presumir que todas as características de uma referência foram adotadas.

## Avaliadores podem discordar sobre a mesma imagem

No pré-print [DesignPref](https://arxiv.org/html/2511.20513), 20 designers profissionais produziram 12 mil comparações de pares de interfaces geradas. Os autores relatam discordância substancial nas preferências binárias e razões diferentes para valorizar características como contraste e densidade.

**Limite:** as comparações foram de interfaces, não de artes para divulgação do Compor; o trabalho também explora treinamento de modelos, que não é objetivo desta v0. A discordância não prova que qualquer escolha seja igualmente adequada a uma tarefa específica.

**Implicação proposta:** preservar a identidade da pessoa, o contexto, o par realmente exibido e motivos opcionais quando autorizados. Manter avaliações discordantes e requisitos factuais separadamente; uma preferência majoritária não substitui a decisão da pessoa sobre sua campanha.

## Mais diálogo pode ajudar algumas pessoas e custar tempo a outras

No [OptiMuse](https://arxiv.org/html/2401.07312), 12 pessoas com experiência em design participaram de um estudo comparativo de alterações gráficas. O protótipo combinava diálogo e múltiplas opções, enquanto o comparador usado no estudo era outro protótipo, sem diálogo e com uma saída por comando. Um profissional humano simulou o agente no experimento; participantes expressaram preferências diferentes sobre discutir, escolher ou receber execução direta.

**Limite:** é um estudo pequeno, com tarefas delimitadas e simulação humana; como diálogo e número de alternativas mudam juntos, ele não isola o efeito de cada um nem mede o funcionamento de um agente Compor.

**Implicação proposta:** testar se uma pessoa com intenção definida consegue seguir para a peça e se outra consegue explorar em etapas. Registrar perguntas, tempo ativo, ajuda, satisfação e não conclusão; não interpretar mais interações como sucesso por si só.

## Como traduzir isso em uma avaliação do Compor

1. Antes da tarefa, registrar intenção, contexto, restrições e benefício esperado pela pessoa; preservar quem prefere o processo habitual como evidência válida.
2. Em alternativas realmente exibidas, observar separadamente contraste perceptível, utilidade para a escolha e alinhamento à intenção; uma alternativa ausente não recebe nota.
3. Registrar se houve correção ou confirmação de interpretação; se a pessoa não respondeu, não supor entendimento mútuo nem falha.
4. Comparar com o processo habitual em tarefas equivalentes, registrando aprendizado, ajuda, custo, tempo e retrabalho indesejado. O estudo inicial pequeno é descritivo; não garante inferência populacional.
5. Manter limites obrigatórios de privacidade, autorização e preservação do trabalho à parte de qualquer pontuação de criatividade. Se a evidência for insuficiente, o resultado da avaliação é inconclusivo.

O [exemplo de calibração](2026-10-27-calibracao-evals-exemplo.md) é inteiramente sintético e ajuda a discutir a rubrica; não é um resultado desses estudos nem uma avaliação de usuário.
