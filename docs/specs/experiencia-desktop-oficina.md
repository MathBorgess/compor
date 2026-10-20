# Especificação: experiência desktop da Oficina em Prancha

**Data:** 20/10/2026. **Estado:** especificação para revisão; sem implementação. Síntese da conversa com o autor e dos documentos do projeto. A instrução mais recente autoriza somente escrever as specs no repositório privado.

## Problem Statement

Quem prepara uma palestra ou oficina precisa desenvolver uma narrativa, escolher referências visuais e adaptar essa base a diferentes materiais. Ao recomeçar cada peça com um novo briefing, decisões sobre mensagem, voz, imagens, formas e cores podem se perder ou ficar inconsistentes.

O público inicial proposto é formado por facilitadores e palestrantes que fazem esse trabalho profissionalmente. A frequência da dor, a economia de tempo e a disposição a pagar ainda não foram medidas. A seleção morfológica anterior não valida demanda para este novo escopo.

## Solution

Um aplicativo desktop em Electron, baixável para uso interno. A pessoa constrói a narrativa enquanto vê e escolhe imagens, formas e cores. O app preserva o contexto e os recursos visuais numa skill interna por palestra/oficina.

Ao escolher uma saída, o app combina o contexto da oficina com um prompt e uma skill próprios daquele formato. O conteúdo é gerado, revisado, editado e salvo no próprio aplicativo. Pitch deck, LinkedIn e Instagram são os formatos citados pelo autor.

O primeiro recorte proposto usa blocos editáveis e templates limitados. A primeira demonstração deve reutilizar uma oficina salva em duas saídas; a meta proposta do ciclo completo inclui os três formatos. Esse recorte é planejamento, não uma decisão adicional do autor sobre acabamento ou exportadores.

## User Stories

As histórias detalham o comportamento discutido. Requisitos de operação e robustez derivados pelo agente estão identificados como propostas; não equivalem a funcionalidades já implementadas ou a novas decisões explícitas do autor.

1. Como facilitador, quero baixar um aplicativo desktop para preparar minhas oficinas no ambiente de uso interno.
2. Como facilitador, quero abrir minha oficina no aplicativo para realizar o fluxo de criação no mesmo ambiente.
3. Como autor, quero criar uma oficina identificando seu tema para situar o conteúdo que vou desenvolver.
4. Como autor, quero registrar o público da oficina para orientar a linguagem e os exemplos.
5. Como autor, quero registrar o objetivo da oficina para manter a narrativa ligada ao resultado pretendido.
6. Como autor, quero informar sua duração para orientar o planejamento do conteúdo.
7. Como autor, quero organizar abertura, mensagem central, exemplos, atividades e fechamento para construir uma narrativa compreensível.
8. Como autor, quero editar os blocos diretamente para manter minha voz e corrigir o conteúdo.
9. Como autor, quero solicitar alternativas de narrativa à IA para explorar maneiras de apresentar uma ideia.
10. Como autor, quero comparar alternativas para escolher o que faz sentido para minha oficina.
11. Como autor, quero aceitar ou rejeitar sugestões para controlar o conteúdo que será preservado.
12. Como autor, quero que minhas edições aprovadas sejam preservadas para não perder trabalho quando pedir outra sugestão.
13. Como autor, quero ver imagens enquanto escrevo para relacionar o visual à narrativa durante a criação.
14. Como autor, quero escolher referências visuais para definir quais imagens representam a oficina.
15. Como autor, quero relacionar imagens aos blocos para preservar o sentido de cada escolha visual.
16. Como autor, quero ver e ajustar formas para explorar a organização visual do conteúdo.
17. Como autor, quero ver e escolher cores para definir a identidade visual da oficina.
18. Como autor, quero comparar sugestões visuais para escolher o que combina com a mensagem.
19. Como autor, quero salvar o contexto narrativo e visual para não depender somente do histórico da conversa.
20. Como autor, quero fechar e reabrir a oficina para continuar sem repetir o briefing.
21. Como autor, quero recuperar as imagens escolhidas ao reabrir para que as referências continuem utilizáveis.
22. Como autor, quero que a skill da oficina seja mantida internamente para não precisar escrever ou instalar uma skill em outro agente.
23. Como autor, quero escolher um formato de saída para adaptar a oficina ao material de que preciso.
24. Como autor, quero indicar o objetivo daquele material para orientar sua geração a partir do contexto existente.
25. Como apresentador, quero gerar um pitch deck da oficina para organizar sua narrativa em uma sequência de slides.
26. Como autor, quero gerar um post de LinkedIn para comunicar uma ideia da oficina com minha voz.
27. Como autor, quero gerar conteúdo de Instagram para apresentar a narrativa em cartões e legenda.
28. Como autor, quero reutilizar a mesma base entre formatos para não precisar fazer um novo briefing para cada material.
29. Como autor, quero que as saídas preservem os fatos aprovados para não introduzir informações que eu não forneci.
30. Como autor, quero que as saídas mantenham voz e escolhas visuais reconhecíveis para que os materiais pertençam à mesma oficina.
31. Como autor, quero receber o conteúdo dentro do aplicativo para concluir o fluxo sem levar um pacote a outro agente.
32. Como autor, quero revisar e editar o resultado no app para corrigir sua adequação antes de salvá-lo.
33. Como autor, quero salvar a saída editada para retomá-la e usá-la posteriormente.
34. Como autor, quero gerar uma nova versão preservando a anterior para experimentar sem apagar conteúdo aprovado.
35. Como autor, quero identificar a versão da oficina que originou uma saída para entender qual base foi utilizada. **Rastreabilidade proposta.**
36. Como autor, quero manter o trabalho salvo quando uma geração falhar para poder retomar sem reconstruir a oficina. **Robustez proposta.**

## Implementation Decisions

### Decisões confirmadas pelo autor

- **Plataforma:** Electron, com aplicativo baixável para uso interno. Perssua é referência de experiência citada pelo autor; não se presume sua arquitetura ou equivalência de funcionalidades.
- **Criação:** imagens, formas e cores ficam visíveis enquanto o usuário constrói a narrativa.
- **Contexto:** cada palestra/oficina tem uma skill interna que carrega seu contexto narrativo e visual.
- **Geração:** cada formato usa prompt + skill, combinados com o contexto da oficina; o conteúdo é gerado na ferramenta.
- **Repositório:** a construção e estas specs ficam em repositório privado. O repositório acadêmico mantém o experimento original.
- **Limite desta execução:** apenas especificação e documentação, sem implementação.

### Fronteiras e contratos propostos

- **Gestão da oficina:** receber briefing, narrativa e escolhas visuais; salvar e recuperar uma oficina com seus recursos. Persistência local é a proposta inicial, sem esquema ou tecnologia de armazenamento fechados.
- **Editor narrativo e visual:** apresentar os blocos e as referências, permitir escolhas e edições e preservar o que foi aprovado. Sugestões não substituem silenciosamente trabalho manual.
- **Revisão das saídas:** permitir revisar e editar o conteúdo no app como requisito derivado do fluxo documentado; a confirmação explícita do autor foi sobre o local de geração.
- **Contexto interno:** separar instruções de uso, conteúdo da oficina, recursos visuais e versões. Preservar os arquivos de imagem e suas relações, em vez de guardar somente nomes ou descrições.
- **Adaptadores de formato:** receber uma versão aprovada da oficina, formato e objetivo do material; usar prompt e skill próprios; produzir um rascunho adequado ao formato para revisão no app.
- **Resultado e versão:** salvar a saída e sua origem sem apagar versões anteriores. Comportamento de cancelamento, repetição de chamadas e sincronização não foi fechado.
- **Serviço de geração:** encapsular a integração com o fornecedor que for escolhido. Credenciais não pertencem ao contexto da oficina. Geração no app descreve a experiência; não estabelece inferência offline ou modelo executado na máquina.
- **Desktop:** separar interface e operações privilegiadas conforme a arquitetura do Electron. React/TypeScript, divisão de responsabilidades e mecanismo de comunicação são propostas, sem assinatura de API ou esquema definitivo aprovado.
- **Entregas por formato:** deck com sequência e composição em template; LinkedIn com texto editável e arte opcional; Instagram com cartões e legenda. Quantidades, limites de texto, dimensões e extensões de arquivo permanecem abertos.

Nenhuma interface executável, migração, contrato de API ou componente já existe no repositório. Estas fronteiras descrevem responsabilidades esperadas, sem fixar organização de arquivos ou código.

## Testing Decisions

### Fronteira principal proposta para conferência do autor

Preferir **uma fronteira de teste do comportamento completo do aplicativo**, pela experiência do usuário: criar → compor narrativa e visual → salvar → encerrar/reabrir → gerar formatos → revisar/editar → salvar e recuperar saídas. A proposta se apoia no ciclo já discutido; ainda não houve confirmação explícita do autor sobre a fronteira técnica de testes.

O repositório contém somente documentos. Não há testes anteriores, framework ou infraestrutura de teste a reaproveitar. Não introduzir um framework ou testes executáveis nesta etapa de specs.

### O que um bom teste observa

- Verificar resultados visíveis e conteúdo recuperado, preservado ou gerado, em vez de espelhar componentes da interface, estrutura interna da skill ou chamadas entre processos.
- Usar uma oficina sintética com fatos, blocos e referências visuais conhecidos. Tornar armazenamento e geração substituíveis no ambiente de teste, sem expor detalhes internos como contrato de aceite do produto.
- Exercitar a mesma fronteira nos casos abaixo, evitando criar um conjunto separado de testes para cada módulo. Os responsáveis cobertos são editor, contexto/persistência, geração por formato e revisão/salvamento das saídas.

| Caso de aceite proposto | Resultado observável |
| --- | --- |
| Construção visual | Imagens, formas e cores podem ser vistas e escolhidas antes de selecionar uma saída |
| Persistência completa | Após fechar/reabrir, briefing, narrativa, decisões e arquivos visuais continuam disponíveis |
| Reutilização | Duas saídas da primeira demonstração usam a mesma oficina sem novo briefing; a meta completa cobre os três formatos |
| Geração interna | O conteúdo aparece no app e pode ser revisado, editado e salvo ali, sem execução em outro agente |
| Fidelidade | Os fatos esperados, a voz e as referências aprovadas são comparados com critérios definidos antes da avaliação |
| Preservação | Uma geração nova e uma reabertura não eliminam edições ou saídas anteriores |
| Rastreabilidade proposta | É possível relacionar a saída à versão da oficina utilizada |
| Falha proposta | Uma falha do serviço de geração deixa o trabalho salvo recuperável; o tratamento detalhado ainda precisa ser definido |

### Evidências separadas

- **Simulação determinística:** verifica fluxo, persistência e preservação sob entradas conhecidas. Não comprova a qualidade de um modelo real.
- **Integração com IA real:** verifica acesso ao fornecedor, adequação do resultado, erros, custo e latência quando fornecedor e acesso forem definidos. Não há limiares numéricos aprovados.
- **Uso por outra pessoa:** observar conclusão sem orientação por cima do ombro e registrar dificuldades, tempo e correções. Essa observação ainda não foi realizada.
- **Validação comercial:** disposição a pagar, custo total, benefício e receita exigem evidências próprias. Passar testes do app não estabelece esses resultados.

## Out of Scope

**Nesta execução:** implementar o app, criar código de produto, instalar dependências, criar testes executáveis, empacotar instaladores, publicar downloads ou iniciar testes com compradores.

**No primeiro recorte proposto:** publicação automática nas redes, colaboração simultânea, editor visual genérico, sincronização em nuvem e integração obrigatória com outro cliente de agentes. Geração de imagens por modelo é uma extensão a avaliar; exibir e preservar imagens já pertence ao fluxo central.

Não fazem parte desta spec promessas de funcionamento offline, suporte a sistemas operacionais ainda não escolhidos, formatos editáveis de exportação não definidos ou retorno financeiro garantido.

## Further Notes

- A direção atual substitui a entrega original de roteiro curto + prancha PNG. O sorteio, as três propostas e o parecer permanecem preservados no projeto acadêmico; não houve nova seleção dos agentes para este recorte.
- O preço, a contribuição e o esforço da antiga prancha não foram transferidos para o app. Custos, capacidade, cronograma de construção e oferta comercial precisam de nova avaliação.
- Permanecem abertos sistemas-alvo, distribuição/assinatura, fornecedor/modelo de IA, credenciais e rede, exportadores, persistência definitiva, geração de imagens e capacidade do grupo.
- Esta spec não decide marca definitiva, licença do futuro código, desenho de interface ou critérios numéricos de desempenho.
- A skill `morphological-project-design` seleciona projetos; a skill interna de cada oficina pertence ao produto. Nenhuma delas deve ser confundida com um pacote que o usuário precise executar fora do app.
- O rótulo de triagem `ready-for-agent` identifica a especificação no tracker. Não substitui a instrução explícita de manter esta execução restrita às specs.
- Fonte canônica para revisões: [esta especificação no repositório privado](https://github.com/MathBorgess/oficina-em-prancha/blob/main/docs/specs/experiencia-desktop-oficina.md). Sua publicação inicial no tracker reproduz o conteúdo desta versão.
