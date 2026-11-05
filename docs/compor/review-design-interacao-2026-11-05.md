# Revisão de design e interação — 5 de novembro de 2026

A jornada já produziu uma peça com agente, imagem, exportação e armazenamento
reais. O objetivo agora é Matheus revisar a experiência e indicar o que ajustar
antes do refinamento restante do marco 0. Não representa aprovação do design ou
prontidão geral para produção.

Abra o [piloto do Compor](https://compor-marco0.vercel.app) com a conta Google já
autorizada e selecione **Demo de revisão — aula de composição visual**. O projeto
tem a peça principal **Aula de composição visual — vamos criar juntos**, com
versões 1 e 2 e arquivos já salvos. **Estudo alternativo — texto editável** é um
segundo post usado para comprovar criação e seleção automática após salvar.
O moodboard contém o PNG exportado como referência local. Para comparar layout,
navegação e composição, use esses dados; este roteiro não exige outra chamada
ao agente ou geração de imagem.

## O que já foi comprovado

- Projeto criado pela interface; briefing e persona preenchidos com hipóteses.
- Chave temporária em memória; uma sessão `gpt-6.1-terra` executou contexto,
  edição do título, salvamento e proposta de imagem com IDs `exec_` preservados.
- Versão 2 salva após confirmação, mantendo preço, data e legenda; versão 1
  preservada e ambas relidas pelo Codex via MCP, sem chave web.
- Uma imagem `gpt-image-2.6-flare` gerada após confirmação e exibida como base.
- PNG `1080 × 1350` baixado; arte final salva na versão 2 e recuperada pela API
  privada com resposta `200`, decodificada nas mesmas dimensões.

A [evidência técnica](evidencia-e2e-2026-11-05.md) registra IDs, respostas e hash
do download. O uso final do agente veio `null`; custo permanece desconhecido.
O registro de uso da imagem não é uma fatura conciliada.

## Roteiro de revisão

| Etapa | Percurso | O que avaliar |
| --- | --- | --- |
| Entrada e projeto | Entrar com Google e abrir a demo | Clareza de acesso, identificação do projeto e retorno à criação |
| Briefing e comprador | Revisar oferta e “Conhecendo quem vai comprar” | Se campos desconhecidos e hipóteses são compreensíveis; se a linguagem ajuda quem ainda não conhece o público |
| Estúdio | Abrir a peça e examinar texto, arte e conversa | Hierarquia, espaço disponível, foco e relação entre conversa e post aberto |
| Contexto de ajustes | Inspecionar a marcação do elemento de título e a versão aberta | Se fica claro o que será alterado e qual conteúdo deve ser preservado |
| Histórico | Abrir versões 1 e 2 em “Versões” ou “Histórico” | Identificação da versão atual, preservação da anterior e comparação do título com preço/data/legenda iguais |
| Imagem | Examinar a imagem-base da versão 2 | Associação visual correta, enquadramento e distinção entre proposta, geração e aplicação |
| Revisão e download | “Preparar PNG”, revisar e “Baixar PNG” | Legibilidade, proporção, posicionamento dos textos e previsibilidade da passagem à revisão |
| Arquivo salvo | Em “Imagem final no projeto”, abrir a imagem recuperada | Se recuperar e usar uma imagem são ações claras; a leitura não deve ser confundida com aprovação |

Se a imagem-base local não estiver disponível em outro navegador, abra os
artefatos já salvos em **Imagens da versão**. A imagem-base é o fundo gerado; o
PNG final já contém os textos da composição. Para reconstruir a prévia editável,
revise a imagem-base recuperada e escolha **Usar imagem na composição**.
Não é necessário regenerar. Conversa, rascunhos
e referências ficam no navegador; projetos, versões e arquivos salvos têm
persistência remota.

O download e o salvamento final são ações distintas. **Salvar PNG final no
projeto** exige a confirmação de autorização exibida na interface. O arquivo
final já salvo na demo pode ser aberto para esta revisão sem novo upload.

## Ajustes preparados após a prova

O E2E real ocorreu na produção `22e5400`. A revisão `5f0d3de`, com registro de
evidência em `94d282f`, corrige os pontos abaixo. Passaram 133 testes Agents,
119 da web e a build; 64 testes de imagens privadas também passaram. A publicação
final foi observada em `READY`: deployment `dpl_bTiWXMxDyVDXMtgKwkXCyXKn3N7a`,
commit `94d282fba39b00ee15772dd64c48e13db52dcb85`, alias canônico e sem erro de
alias. A reabertura restaurou a imagem e os dados sem chave OpenAI. Também foram
comprovados o início de outro post pelo WebMCP nativo, seu salvamento com seleção
automática da versão 1 e a inclusão do PNG no moodboard, sem nova geração.

| Situação encontrada | Comportamento preparado para revisão |
| --- | --- |
| Primeiro salvamento gravava v1, mas mantinha o rascunho selecionado por diferença na ordem JSONB | Comparar os campos de conteúdo e seguir a versão salva quando não houver edição posterior; preservar edições feitas durante a espera |
| Pedido novo recusado por projeto ocupado permanecia pendente localmente | Encerrar somente o pedido que comprovadamente não foi enviado, preservar o trabalho e informar que outra tentativa exige consulta |
| Imagem pronta, mas resposta final do agente ainda dizia aguardar confirmação | Manter o texto histórico e mostrar confirmação factual após a aplicação local, restrita à peça e versão corretas |

O novo resultado da ferramenta distingue imagem gerada e armazenada da
aplicação no navegador. O receipt visual só confirma a aplicação após a gravação
local retornar sucesso; falha não dispara nova geração. A resposta futura do
modelo não foi retestada com uma segunda chamada paga.

## Como registrar o feedback

Para cada ajuste, anote a tela/etapa, o que tentou fazer, o comportamento
observado e o esperado. Uma captura pode ajudar a indicar alinhamento, espaçamento
ou área de interação; use os artefatos privados da revisão, sem publicar imagens
ou dados por padrão. Separe problemas que impedem concluir a tarefa daqueles
que afetam clareza, aparência ou conforto.

As referências são o [arquivo original e revisão](https://www.figma.com/design/KlGEjt2D3tQHsHb4RsDr6i/Compor-%C2%B7-90-%E2%80%94-Arquivo-original-e-revis%C3%A3o?node-id=22-1743)
e o [arquivo principal, quadro 2009:13865](https://www.figma.com/design/8nEzYvk8LCTQzbknMgEw1c/Compor-%C2%B7-00-%E2%80%94-Arquivo-principal?node-id=2009-13865).
O shell utilizou o quadro e os ativos inspecionados; não há afirmação de paridade
das telas que ainda não puderam ser examinadas.

## O que continua fora do aceite do marco 0

O projeto anterior `597711db-66bd-4170-ac78-377a497e1411` permanece preservado com
uma tentativa ativa ainda a identificar. O pedido novo que recebeu `busy` parou
antes do provedor e não iniciou geração. Não foi usado acesso administrativo,
limpeza ou expiração forçada para contornar esse bloqueio. A recuperação é uma
pendência distinta da revisão do projeto novo.

Também permanecem duas contas/JWTs reais com negação cruzada no Storage,
concorrência entre conexões independentes, recuperação de interrupções e
comparação das demais telas Figma. A prioridade é revisar a jornada funcional de
design e interação e depois refinar esses pontos, sem declarar o marco 0 completo.
