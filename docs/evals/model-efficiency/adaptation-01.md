# Adaptação antes de testar medium

28/10/2026 · Decisão do coordenador, comunicada no chat antes das novas execuções.

O usuário reiterou: finalizar os testes e abrir o PR. O estudo precisa informar a diferença de modelo **e effort**. A triagem `low` percorreu os três modelos e dois braços nos dois casos; a análise do segundo caso ainda está sendo concluída. No primeiro caso, os dois Judges independentes não encontraram um pacote integralmente aceitável. Foram observadas falhas de argumentos recuperadas em todas as seis configurações, além de uma falha de capacidade do serviço em Astra E0.

**Adaptação:** substituir a segunda réplica planejada em `low` por uma rodada em `medium`, para os mesmos três modelos, dois braços e dois casos. Total de 24 trajetórias previstas: 12 low + 12 medium. O arquivo original `schedule.json` e seu freeze permanecem intactos; suas entradas de réplica 2 ficam **não executadas**. O novo `schedule-medium.json` identifica a rodada de effort com IDs próprios. Não chamar os runs medium de réplicas low.

Isso permite comparar o próximo effort antes de investir em outro candidato. Não prova estabilidade, efeito causal, mínimo universal ou qualidade humana: continua uma execução por célula/caso, com gerador estocástico e avaliações sintéticas. Erros de infraestrutura não são evidência de que um modelo precisa de mais esforço. Os motivos para testar medium são os erros de planejamento e os limites de qualidade observados, preservados nos relatórios.

Não mudar a rubrica, o threshold, os casos, E0/E1, as quatro skills, a política de geração/composição ou os limites de edição. E2 fica como proposta separada, sem implementação nesta comparação. As execuções existentes e suas falhas permanecem preservadas. Os wrappers recebem somente um parâmetro de arquivo de schedule; não alteram o runner/modelo/contrato.

Fechamento: publicar diferenças observadas, custos medidos, falhas e se alguma configuração satisfaz a régua. Se nenhuma satisfizer, informar que o mínimo aceitável **não foi estabelecido**; não escolher um vencedor por custo ou baixar a régua para produzir aprovação.
