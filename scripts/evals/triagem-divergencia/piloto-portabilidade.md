# Piloto de portabilidade da triagem no Codex CLI

Em 18/11/2026, o Codex CLI 0.166.0 autenticado com ChatGPT executou o controle do estúdio e a primeira instrução candidata em seis sessões independentes de `gpt-6.2-sol` com esforço baixo. Cada sessão recebeu o pedido de um dos três casos de desenvolvimento do braço completo e os dois, três ou quatro PNGs originais, na ordem do manifesto. O planejador viu o briefing e os arquivos. O juiz recebeu o gabarito. A fonte do controle foi o corpo montado pelo adaptador do produto usando um transporte local em memória. Esta execução mede a portabilidade das instruções para o Codex CLI. O provedor gerenciado, o custo por arte e os pixels de saída pertencem ao ensaio pareado principal.

## Resultados

| Medida | Controle | Candidata |
| --- | ---: | ---: |
| Planos aceitos pelo contrato, três casos | 2/3 | 3/3 |
| Decisões corretas de manter/omitir nos planos aceitos | 6/6 | 9/9 |
| Decisões corretas nos dois casos com ambos os planos aceitos | 6/6 | 6/6 |
| Intenção ligada à referência, nesses dois casos | 12/12 | 12/12 |
| Uso e lugar descritos nos três prompts, nesses dois casos | 11/12 | 11/12 |
| Referências com atributo julgável nos prompts, nesses dois casos | 3/6 | 6/6 |
| Pontos de atributo sobre o máximo julgável | 4/6 | 8/12 |
| Referências com atributo totalmente reconhecido pelo juiz | 1/6 | 2/6 |

A candidata tornou mais descrições visuais julgáveis. A média dos atributos que o juiz conseguiu avaliar foi 1,33/2 nas duas condições. No concerto, o controle mudou um caractere do ID do upload obrigatório e o validador recusou o plano. A candidata conservou esse upload, descartou a textura recusada e obteve 6/6 em cada uma das três dimensões julgadas nesse caso. As nove leituras estruturadas da candidata cobriram os nove arquivos e registraram lugar para as sete referências retidas. A avaliação primária observou apenas o que chegou aos prompts.

O juiz encontrou dois problemas concretos na candidata. Na feira, a cor escura do cartão, RGB (23, 78, 88), foi descrita como verde-escuro em vez de azul-petróleo. Na troca de cadernos, “preservar desenho e cores” ficou genérico demais para dizer que o triângulo tem entalhe inferior e o selo verde tem um vazio claro. A próxima hipótese é transferir para os três prompts o traço que distingue cada marca e explicitar quando a cor é apenas uma aproximação perceptual.

## Como foi comparado

1. Congelar o dataset, as duas instruções e o pedido enviado. Para cada condição, usar uma sessão nova do Codex CLI por caso, sem ferramentas e com os PNGs passados explicitamente por `--image`. Preservar o original, o SHA-256 e os recibos.
2. Passar cada resposta no contrato da condição. Um resultado recusado fica no denominador de planos e recebe abstenção no exame de prompts. Manter o texto original da falha.
3. Sortear dois painéis de três casos, com uma condição de cada caso em cada painel. Dois juízes independentes `gpt-6.2-astra`, esforço médio, recebem aliases aleatórios, prancha de referências e prompts efetivos. Suprimir o registro extra de leituras das duas condições impede que o formato identifique a candidata. Usar a mesma [rubrica de triagem](plan-judge/triage.mjs) nos dois grupos.
4. Pontuar intenção, atributo e aplicação/lugar, de zero a dois, além do acerto em manter/omitir. Publicar contagem de planos e referências avaliáveis e comparação só dos casos pareados. Os juízes viram casos diferentes de cada condição e houve uma execução por combinação; diferenças entre juízes e amostragem do modelo continuam possíveis.

O manifesto congelado do [dataset](dataset/freeze.json) tinha SHA-256 `b564bda83121e3b3a92f9b908e8c38c53bb65356060d824f8b4a314990cb14e0`. Os prefixos dos hashes da instrução do controle e da candidata eram `5a391834d7a5` e `213590de0ef1`. O pacote privado de evidências contém as instruções completas, seis saídas integrais, oito recibos de sessão, chaves de cegamento, os pareceres por referência e os scripts de reprodução.
