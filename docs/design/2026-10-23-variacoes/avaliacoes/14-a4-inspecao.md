# A4 — Inspeção visual: o que justificaria mudar um processo suficiente

23/10/2026. **Crítica simulada do arquétipo satisfeito**, orientada pelos [critérios prévios](03-a4-criterios.md). Foram abertos os onze PNGs abaixo com `view_image`. Não houve clique, tarefa com pessoa, medição de usabilidade ou teste de implementação. As observações descrevem os quadros inspecionados; os riscos de uso são hipóteses, não preferências dos autores reais do corpus.

## Achados materiais enviados durante a inspeção

1. **A sequência C1 → C2-definida muda a redação sem mostrar a intervenção.** C1 contém “organizar suas planilhas”; C2-definida já mostra “cuidar das tarefas do dia a dia”. C3 explica uma frase corrigida, mas o primeiro resultado do percurso definido já contém essa alteração. Isso pode fazer a demonstração de preservação parecer reescrita silenciosa. Manter o texto inicial até a edição demonstrada ou identificar explicitamente o estado posterior à correção. Não é prova de perda de texto em software.
2. **C3 não mostra Desfazer; A2 e B3 mostram.** O quadro de edição da bancada oferece recomposição, reescrita e revisão, mas o retorno de uma edição local não está visível. Histórico acessível em outro quadro não demonstra desfazer no ponto de trabalho. Tornar esse retorno reconhecível reduz uma incerteza material de controle; o PNG não prova que a função inexista.
3. **C5 explicita arquivos e ausência de publicação, mas não o limite de edição externa.** PNG/TXT não carregam camadas para continuar editando no Canva. Esse custo de troca deve ser compreendido antes do investimento na tarefa, além da documentação técnica. O quadro não promete expressamente essa compatibilidade, mas também não a esclarece.

## Questões por quadro observado

| Arquivo visto | Evidência visual e leitura A4 | Questão material ou próxima verificação |
|---|---|---|
| [C1 — Preparar](../renders/C1.png) | Mensagem e fatos ficam juntos; compor, explorar e pedir rascunho são ações distintas. Não aparece cadastro longo de marca | Não demonstra entrada de foto/referência própria ou aplicação das regras já utilizadas. Verificar se isso cabe no contexto sem obrigar migração. Corrigir a continuidade textual com C2-definida |
| [C2 — Comparar](../renders/C2.png) | Duas prévias têm dimensões equivalentes; argumentos distintos recebem explicação. Escolher, ajustar, rejeitar ambas e rever intenção estão visíveis | O desenho oferece encerramento da escolha, sem botão dominante de gerar indefinidamente. Ainda falta demonstrar rejeição preservando uma edição e identificar qual rota continua em C3 |
| [C2-definida — Uma composição](../renders/C2-definida.png) | Uma peça basta; revisar tem destaque, explorar é opcional. O histórico permanece disponível | É um contraponto útil à comparação obrigatória. A redação já alterada, antes de edição visível, compromete a demonstração desse percurso |
| [C3 — Foco numa rota](../renders/C3.png) | Texto e legenda são editáveis junto da arte; mudar composição difere de propor reescrita. O quadro declara conservação da outra rota | Falta Desfazer visível. A rota escolhida não está identificada pelo nome usado em C2. “Texto manual mantido” descreve uma intenção; precisa de antes/depois e comportamento para provar preservação |
| [C4 — Revisão](../renders/C4.png) | “Acesso vitalício” é marcado como pendente; confirmar ou retirar antecede aprovação. Há retorno à edição | A pendência foi injetada, conforme anotação externa. Em pesquisa, explicar a condição evita confundir um cenário preparado com frequência real de erro. Observar se os três aceites esclarecem ou apenas adicionam ritual ao processo já suficiente |
| [C5 — Entrega](../renders/C5.png) | PNG, TXT e dimensões são explícitos; exportar é separado de publicar; voltar à edição e fechar projeto estão disponíveis | Esclarecer o limite de edição externa. “Ao retomar” e “offline” são promessas desenhadas, não retomada verificada. Falta observar reabertura da versão escolhida com a correção preservada |
| [A2 — Estúdio direto](../renders/A2.png) | Reúne prévia, edição, versões, fatos, Desfazer e Revisar. Explorar é visível sem ser obrigatório | Entre os quadros vistos, reúne mais controles necessários à tarefa definida no mesmo espaço. Isso é evidência de presença, não de menor esforço medido. Verificar leitura dos três blocos e uso efetivo dos painéis antes de preferi-lo |
| [B3 — Guia](../renders/B3.png) | Texto/arte, Desfazer e revisão ficam disponíveis; a navegação identifica etapa 3 de 5 | Para quem já tem mensagem, cinco etapas podem acrescentar custo. O quadro não revela se são obrigatórias ou navegáveis. Testar chegada direta ao ajuste e retorno sem repetir dados; não concluir lentidão apenas pela barra |

## Moodboards e independência entre marcas

Os wireframes mantêm “compor” no cabeçalho e “Planilhas para a rotina” na peça. Essa separação nominal está visível. **Nenhum quadro aplica os moodboards à interface nem a marcas de clientes distintas**; portanto, independência visual ainda não foi demonstrada. Os riscos abaixo são de aplicação futura, não defeitos já observados nas peças.

| Moodboard visto | Elementos observados | Limite para A4 |
|---|---|---|
| [01 — Oficina editorial](../moodboards/01-oficina-editorial.png) | Serifas expressivas, papel texturizado, tinta azul escura, terracota e marcas gráficas de edição | Pode apoiar a identidade do Compor. Textura, serifa ou aspecto de impressão não devem virar estilo obrigatório da divulgação do cliente. “Sua voz” exige controle demonstrado, não apenas aparência artesanal |
| [02 — Encaixe e composição](../moodboards/02-encaixe-composicao.png) | Azul e amarelo intensos, tipografia pesada, recortes geométricos e módulos contrastantes | Há identidade própria forte. Grandes áreas saturadas na interface podem competir com a arte e influenciar comparação; usar os mesmos símbolos como controles sem rótulos também criaria aprendizagem adicional. Não transferir automaticamente essa paleta às peças |
| [03 — Caderno de autoria](../moodboards/03-caderno-autoria.png) | Tons ameixa/lilás, papel claro, tecido, fita e traços orgânicos; frase “do seu jeito” | O repertório sugere cuidado pessoal, mas não comprova liberdade de edição. Evitar que textura, paleta suave ou caligrafia se tornem padrão do cliente; a promessa não deve sugerir editor universal fora do recorte estático |

A comparação seguinte deve manter a identidade do aplicativo estável enquanto o material do cliente muda de linguagem visual. Sem isso, gostar de um moodboard pode esconder a perda de autonomia que A4 procura evitar. Não há base para atribuir preferência por qualquer uma das três direções aos autores públicos.

## Conclusão da inspeção

A separação entre compor e explorar, a revisão explícita e as saídas para concluir reduzem riscos previstos nos critérios. A demonstração da continuidade do texto e a compreensão da saída externa ainda precisam de ajuste. A2 mostra controles úteis concentrados; C torna a comparação explícita; B apresenta sequência orientada. Nenhum deles provou compensar o processo habitual.

O julgamento continua condicionado a uma tarefa comparável, benefício combinado antes, custo total e escolha legítima de não adotar. As imagens não demonstram geração, salvamento, exportação, retomada, vendas, pagamento ou valor continuado de assinatura.
