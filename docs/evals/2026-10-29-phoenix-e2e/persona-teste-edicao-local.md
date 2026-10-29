# Teste independente da edição local pela persona simulada

Em 29/10/2026, após a avaliação final, o agente que interpretou a pessoa crítica executou a tarefa sem ajuda operacional do agente principal. Isso é uma simulação feita por agente capaz de usar terminal, não teste com criador real nem prova de edição autônoma no produto.

## Tentativa e barreiras

1. O caminho inicialmente informado para o guia (`README-edicao.md`) não existia. A tarefa ficou bloqueada; não se inventou procedimento. O agente principal corrigiu o caminho para `editar-peca-local.md`. Essa correção posterior foi ajuda de localização e precisa ser considerada: **a descoberta do procedimento não foi independente**.
2. O procedimento válido exige copiar e editar um arquivo JSON, preservar hash e caminhos, escolher nomes novos e executar comando Node no terminal. A prévia PNG depende de Sharp e de um `NODE_PATH` específico do ambiente local. Essa exigência é fricção para a persona que quer criar e editar conversando; o ensaio não prova que uma pessoa leiga consiga usar esses passos.
3. Foi criada uma cópia `peca-editavel-manifesto-persona-v1.json`; somente `subtitulo` mudou para “Uma ideia de curso sobre suas contas”. O manifesto original foi preservado. Usou-se o comando documentado para criar `artifacts/peca-persona-v1.svg` e `artifacts/peca-persona-v1.png`, ambos novos, sem sobrescrita.
4. A prévia PNG foi aberta e inspecionada: o novo subtítulo aparece legível; título, rótulos, paleta e composição visual permanecem. As listas e rótulos continuam separados do texto do subtítulo no SVG.

## Verificação

- O SHA-256 da imagem de base no SVG original v6 e no novo SVG é `d70898c96fed57a5fbad62093191594bc0c0ba680114c2cb0a9610f7a31a7508`; o arquivo original de base tem o mesmo hash.
- O manifesto original permaneceu com SHA-256 `ff7dda4932b0f3d5773f68abedc49bb45df29b8d40d83c7cd66d4c0c42d3b531` antes e depois.
- O `titulo` e os dois rótulos mantiveram o texto; apenas `contexto` mudou de “Uma ideia de curso para pessoas autônomas” para “Uma ideia de curso sobre suas contas”.

## Julgamento da persona

A alteração foi possível depois que o guia correto foi apontado, sem refazer a imagem; o resultado continua um rascunho. Não foi uma edição fluida na conversa: a solução pediu conhecimento de JSON, caminhos e terminal. Eu não consigo concluir, a partir deste ensaio, que conseguiria fazer isso sozinha na interface do produto, nem que uma pessoa usuária real conseguiria. Nenhuma publicação foi solicitada ou aprovada.

A avaliação anterior 12/16 permanece preservada: este ensaio resolve somente a alteração local por agente com guia corrigido, não o critério de edição pela pessoa no produto. Para revisar esse critério, é necessária uma experiência de edição acessível e um teste de usuário no próprio produto.
