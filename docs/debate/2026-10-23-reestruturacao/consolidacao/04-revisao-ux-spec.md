# Revisão de UX da spec consolidada

23/10/2026. Comparação documental entre a [spec](../../../specs/compor-reestruturado-2026-10-23.md) e a [experiência proposta](01-experiencia-proposta.md). Não houve teste com pessoas, execução de aplicativo ou verificação de integração. A spec não foi editada nesta revisão.

**Conclusão:** há base suficiente para planejar um protótipo futuro. Jornada por intenção, edição direta, alternativa visível, rejeição de ambas as rotas, preservação de versões e fronteira de teste estão alinhadas. Dois pontos precisam ficar operacionais antes do ensaio.

## Achados materiais

1. **Fato pendente usado na peça ainda não tem condição explícita de saída.** A spec distingue fatos pendentes, confirmados e omitidos no Estúdio e impede considerar imagens provisórias como arte final. Porém, não declara igualmente que um fato pendente presente no material impede sua aprovação como final. Isso permite interpretações diferentes no protótipo e na contagem de ativação. Acrescentar ao aceite: confirmar ou retirar o fato pendente usado antes da aprovação/exportação final. Campos pendentes que não aparecem na peça não devem bloquear a tarefa; o rascunho permanece editável. Referência: “Recursos, dados e saída” e “Comportamento verificável”.

2. **Definir início de tarefa própria no diagnóstico.** O denominador primário está correto: todos os qualificados atribuídos, incluindo abandono e indisponibilidade. O secundário diz apenas “participantes que iniciaram a tarefa”, embora exista exemplo fictício. Sem definição, explorar a demonstração pode inflar iniciantes ou ser contado de modo diferente entre sessões. Registrar início como salvar a primeira tarefa com material próprio; demonstração não conta. Manter abandonos posteriores, reportar atribuídos/iniciantes/ativados e usar o mesmo evento de ativação nos dois indicadores. Referência: “Instrumentação” e tabela de KPIs.

## Caminho viável para prototipar

Um protótipo interativo com conteúdo preparado pode investigar escolha de intenção, compreensão das rotas, edição percebida e conclusão. Deve identificar resultados simulados; não comprova geração, persistência ou ganho com usuários.

Um protótipo executável posterior precisa verificar a fronteira completa: entrada autorizada, revisão, arquivos abertos externamente e projeto restaurado. Adaptador determinístico permite ensaiar cancelamento, falha e resposta atrasada sem presumir integração existente. Abrir/editar/exportar sem rede e preservar trabalho exigem execução real, não cliques em telas simuladas. Integração oficial e avaliação humana permanecem etapas separadas, como a spec já declara.

Não encontrei regressão material na separação entre gerar, aplicar e aprovar, nem na manutenção de alternativas após falha. As quatro áreas não impõem onboarding rígido. O risco de ancoragem versus sobrecarga continua corretamente aberto, assim como uso externo, recorrência e benefício incremental. Esses pontos precisam de observação futura; não são decisões validadas pelo debate.
