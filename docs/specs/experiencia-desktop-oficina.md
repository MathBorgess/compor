# Especificação: experiência desktop da Oficina em Prancha

> Histórico em 20/10/2026. O [recorte Compor](compor-macos-v1.md) substitui este caso-guia. O texto abaixo preserva decisões e propostas anteriores.

**20/10/2026 · Proposta para revisão, apenas documentação.** Invariantes do autor preservados; recorte comercial e novos contratos derivados do debate RCD. Não há app, instalador, teste de uso ou oferta disponível. `ready-for-agent` não autoriza implementar.

## Problem Statement

Quem prepara uma palestra/oficina precisa desenvolver a narrativa, escolher referências visuais e adaptá-la a diferentes materiais. Recomeçar o briefing de cada peça pode perder decisões, repetir revisão e introduzir inconsistências. Frequência, prioridade e custo desse problema ainda não foram medidos.

O debate propôs como caso P1 uma pessoa fundadora de microconsultoria de uma a três pessoas, sem designer dedicado, que vende oficinas B2B de feedback/conversas difíceis para líderes e tem uma oferta para apresentar a RH/T&D em até 30 dias. A consultoria compra e a pessoa facilitadora opera; RH compra a oficina dela. Recife metropolitano é recorte de pesquisa, sem acesso demonstrado. P1 é sintético e não prova demanda ou desatendimento.

Depois desse debate, o autor pediu investigar **outros perfis que vendem produtos ou serviços e outros materiais de venda**. P1 passa a ser controle, sem público definitivo fechado. A generalização de contexto de oficina para contexto de oferta é proposta de investigação; não autoriza um produto genérico para qualquer vendedor. As combinações e critérios ficam no documento de variações.

O novo agente recomenda descobrir primeiro o trabalho de fotógrafos de alimentos que respondem a restaurantes com proposta/portfólio, e cerâmica para lojistas como contraste de produto, com catálogo/condições. Branding e templates digitais ficam como alternativas investigadas. Nenhuma recomendação é escolha do autor ou prova de demanda; custos e critérios P1 não são herdados por esses casos.

Gamma/Canva já cobrem apresentações, posts e materiais reutilizáveis. Uma skill interna não basta como diferença. A hipótese testável é facilitar a revisão de uma mudança entre materiais, preservando fatos, permissões e adaptações deliberadas, com menor esforço total e qualidade equivalente. Gerar material não resolve automaticamente falta de leads ou vendas.

## Solution

Aplicativo desktop em **Electron**, baixável para uso interno, em que a pessoa constrói a narrativa enquanto vê imagens, formas e cores. O contexto e os recursos da palestra/oficina ficam numa skill interna. Ao selecionar formato e objetivo, contexto + prompt + skill de formato produzem conteúdo **dentro do app**. Revisão e edição internas são requisitos derivados propostos.

O desenho completo conserva os formatos citados pelo autor: pitch deck, LinkedIn e Instagram. Para testar o caso P1, a recomendação final dos agentes é **deck comercial + LinkedIn primeiro**; Instagram fica em marco posterior. Não oferecer escolha de social antes de verificar ambos. Essa ordem limita investimento, sem provar preferência do mercado ou constituir aprovação humana.

O serviço proposto para P1 é compra pontual por oficina, operada pelo cliente no app, com acompanhamento limitado, materiais exportáveis e projeto recuperável. Não é operação terceirizada em outra ferramenta. Preço, prazo e suporte são hipóteses: **não vender agora**, pois custo completo, dados, instalação, capacidade e teto de valor estão abertos. Variações de usuário/tarefa exigem nova avaliação de escopo e economia.

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

37. Como autor, quero ver lacunas e aprovar os fatos da oferta para não transformar uma informação ausente em afirmação comercial inventada. **Proposta do debate.**
38. Como autor, quero definir o que cada peça pode divulgar para manter condições privadas fora da divulgação pública. **Proposta.**
39. Como autor, quero conhecer e autorizar os dados enviados ao provedor em cada tarefa para controlar o processamento externo independentemente de quem verá a peça. **Proposta.**
40. Como autor, quero manter conteúdo marcado como somente local fora de chamadas externas, inclusive de preparação da narrativa e deck, para não enviá-lo indiretamente antes da geração social. **Proposta.**
41. Como autor, quero ver a mudança da base junto das peças e suas versões para revisar impactos mesmo quando o app não identificar automaticamente uma relação. **Proposta.**
42. Como autor, quero aceitar, rejeitar ou desfazer atualizações por peça para preservar edições e omissões deliberadas. **Proposta.**
43. Como autor, quero indicar adaptações intencionais para que uma versão social não seja tratada como erro só por omitir um detalhe do deck. **Proposta.**
44. Como autor, quero exportar e abrir os materiais no destino e conhecer suas limitações de edição para verificar se atendem ao comprador. **Proposta.**
45. Como autor, quero criar e restaurar uma cópia da oficina com seus recursos para recuperar o trabalho sem depender do histórico de chat. **Proposta.**
46. Como cliente, quero continuar abrindo, editando e exportando trabalho existente após a janela do serviço, sem nova inferência ou renovação, para não perder acesso ao que produzi. **Proposta.**
47. Como cliente, quero conhecer compatibilidade, rede, provedor, custos e limites antes de iniciar para decidir se consigo usar o serviço na minha ocasião. **Proposta.**
48. Como cliente, quero conhecer entregas, participação, revisões, suporte, correção e encerramento antes de contratar para comparar a oferta com meu fluxo atual. **Proposta.**
49. Como autor, quero cancelar ou retomar uma geração falha sem apagar trabalho aprovado nem disparar repetição/custo silenciosos para manter controle do projeto. **Proposta.**
50. Como cliente, quero relatar uma falha em linguagem comum e conhecer seu acompanhamento mesmo perto do fim da janela para não precisar diagnosticar o app ou pagar novamente pela correção contratada. **Proposta.**

As histórias 1–36 preservam a baseline. A história 27 permanece no produto completo e não na primeira construção proposta de P1. As demais histórias acrescentadas são recomendações, sem funcionalidade implementada. O eventual uso em produtos/serviços diferentes não se considera coberto apenas por trocar o nome do ator: requer escolher e testar uma combinação de perfil, oferta e material.

## Implementation Decisions

### Confirmado pelo autor

- Electron, aplicativo baixável e utilizado internamente; Perssua é referência de experiência, sem presumir arquitetura ou equivalência de funcionalidades.
- Imagens, formas e cores durante a construção da narrativa.
- Contexto narrativo e visual por palestra/oficina numa skill interna, com os recursos preservados.
- Conteúdo gerado no app por contexto + prompt + skill de formato; exemplos pitch deck, LinkedIn e Instagram.
- Construção em repositório privado. Nesta execução, somente specs e planos, sem implementação.
- Investigação adicional de perfis que vendem produtos/serviços e de outros materiais comerciais. Não houve escolha humana de novo nicho, preço ou primeiro adaptador.

### Contratos propostos

- **Oficina recuperável:** briefing, blocos, fatos, voz, imagens/formas/cores, relações, permissões e versões sobrevivem a fechar/reabrir e restaurar cópia. Persistência local é proposta. Conteúdo não depende só do chat ou de um link externo de imagem.
- **Base aprovada:** tema, público, objetivo, duração/modalidade/escopo e condições fornecidas orientam a peça. Lacunas continuam explícitas; não inventar credenciais, clientes, resultados, agenda, investimento ou prova social. Aprovação do usuário define a versão de origem.
- **Duas permissões:** autorização para processar dados no provedor por tarefa é distinta de autorização para divulgar em cada saída. Não inferir uma da outra nem reaproveitar silenciosamente permissão entre provedores/tarefas. Sem autorização válida, bloquear envio e manter trabalho local. Dado local pode ser inserido manualmente na peça sem entrar em IA externa.
- **Cadeia de dados completa:** cobrir entrada, preparação/narrativa, deck, social, atendimento/registros e cópia/exportação. Filtrar antes de todo envio conforme sua autorização; não basta filtrar o social depois de expor o conteúdo na preparação. Credenciais não entram em contexto, prompts, exportação ou logs. Antes de conteúdo real, definir fornecedor, dados/imagens enviados, finalidade, retenção/exclusão e acesso do atendimento; até lá, usar dados sintéticos.
- **Geração por formato:** receber base aprovada, objetivo e permissões; compor contexto permitido + prompt + skill versionados. Conteúdo aparece para revisão/edição no app. Registrar origem e custo/limite informado. Falha ou cancelamento preserva edições; repetição é explícita. Não confundir teste simulado com integração real.
- **Mudança seletiva:** nova base não sobrescreve saídas aprovadas. Mostrar diferença, versões e todas as peças; marcar possível impacto sem prometer detecção semântica infalível. Aplicar/rejeitar/desfazer por peça; preservar adaptações/omissões deliberadas. Pedir revisão quando houver incerteza.
- **Visual e edição:** referências fornecidas e autorizadas, formas e cores acompanham blocos desde a criação. Templates limitados são proposta inicial; exibir imagem não implica gerar imagem por IA. Revisão deve permitir corrigir texto e composição antes de salvar/exportar.
- **Entregas P1:** deck comercial até seis slides PDF; LinkedIn até 1.800 caracteres e uma arte PNG; posteriormente Instagram até quatro PNGs e legenda até 1.000 caracteres. Um template por formato, textos exportáveis e cópia recuperável do projeto. Quantidades/extensões são propostas de agentes. Não é deck completo da aula; PDF/PNG não garantem edição em PPTX/Canva.
- **Continuidade:** abrir/editar/exportar material existente sem nova inferência, renovação ou conexão de cobrança. Nova geração exige acesso e custo declarados. Cópia privada da oficina não é anexada automaticamente a peça pública; exportação não carrega contexto privado/credenciais por acidente.
- **Desktop e limites:** separar interface, operações privilegiadas e ponte restrita, com entradas validadas e isolamento. React/TypeScript, persistência e organização interna continuam propostas. Escolher SO, instalador/assinatura/atualização, provedor e acesso antes de distribuir; não exigir desativação de proteções. Geração no app não significa offline.
- **Serviço assistido P1:** uma oficina/público/identidade, sessão e suporte limitados, uma rodada consolidada; correção de defeito não consome ajuste. Reprodução/diagnóstico cabem ao prestador, com relato simples do cliente. Definir canal, contagem, continuidade de casos, pagamento, cancelamento e prazo/meio de reembolso antes de contratar. Termos e preço não estão vigentes. Assistência não comprova autonomia.
- **Fatiamento e variações:** primeira proposta P1 é deck + LinkedIn; os três formatos pertencem ao desenho completo. Outro perfil/material pode exigir outra ordem, contexto, dados e exportação; investigar e reestimar antes de construir. Não introduzir integrações comerciais ou editor genérico apenas para atender todos os perfis.

Não há API, migração, interface executável, biblioteca ou código escolhido por estes contratos. A faixa técnica de 98–184h de entrada e 106–200h completa é julgamento condicional, com capacidade desconhecida e necessidade de reestimativa; não é orçamento, autorização ou cronograma prometido.

## Testing Decisions

### Fronteira principal proposta, ainda sem confirmação técnica do autor

Uma fronteira do comportamento completo do aplicativo: criar base e visual → aprovar fatos/permissões → salvar/reabrir → gerar duas peças → revisar/editar → exportar → mudar um fato → revisar impacto seletivamente → restaurar e recuperar o material. Reaproveitar essa fronteira para verificar os responsáveis de edição, contexto/persistência, geração e saídas. O repositório não possui testes ou infraestrutura anterior; não criar testes executáveis nesta execução.

Bom teste observa resultado e preservação do trabalho, sem espelhar componentes, arquivos internos da skill ou chamadas IPC. Usar fatos e marcadores sintéticos conhecidos, imagens autorizadas e gerador substituível para o fluxo determinístico.

| Caso proposto | Aceite observável |
| --- | --- |
| Criação visual | Imagens, formas e cores visíveis/editáveis antes de escolher saída |
| Persistência/cópia | Após fechar/reabrir e restaurar, contexto, imagens, relações e edições continuam recuperáveis |
| Reutilização | Deck e LinkedIn usam a base sem repetir briefing; Instagram recebe os mesmos critérios em seu marco |
| Fatos e lacunas | Ausência permanece pendente; resultado aceito não contém afirmação comercial crítica inventada |
| Permissões em toda a cadeia | Inspeção de entradas/saídas sintéticas de narrativa, deck, social, registros e atendimento mostra cumprimento de autorização por tarefa e peça; dado somente local não sai à IA |
| Mudança e adaptação | Alterar duração mantendo uma omissão social deliberada; ver diferenças/todas as peças, aceitar/rejeitar/desfazer sem apagar aprovado |
| Falha/cancelamento | Trabalho salvo recuperável; nenhuma repetição/custo silencioso; nova geração preserva a anterior |
| Portabilidade/encerramento | Abrir PDF/PNG/texto no destino; editar/reexportar existente e restaurar sem inferência/renovação; perdas de editabilidade declaradas |
| Instalação | Começar pelo instalador no SO declarado sem desativar proteções; registrar impedimentos desde antes da instalação |
| Atendimento | Relato simples próximo do fim da janela recebe acompanhamento/correção ou encerramento previsto; cliente não precisa diagnosticar; custo registrado |

Separar quatro evidências: simulação determinística verifica o fluxo; IA real verifica integração/adequação/custo/latência; uso independente observa esforço e autonomia; compra/entrega verifica demanda e economia. Uma não substitui outra. Zero erro no material final testado não é garantia geral de IA infalível ou privacidade.

No plano P1, os limiares 4/5 testados concluindo e mediana de 30% menos tempo são hipóteses exploratórias, não benchmarks, aprovação do autor ou prova estatística. Contar preparação, instalação, revisão, espera, ajuda e exportação; comparar com briefing mestre e ferramentas habituais. Relatar também recebidas/qualificadas/recusadas/excluídas: 4/5 testes não significa atender 4/5 oportunidades. Reestabelecer a tarefa para cada variação de perfil/material antes de comparar.

## Out of Scope

Nesta execução: código do app, dependências, testes executáveis, instaladores/downloads, contato, divulgação, testes com compradores, contratação ou cobrança. As novas variações são investigação documental.

Na entrada P1 proposta: Instagram ainda não verificado, PPTX/Canva editável, slides completos de aula, publicação, leads, venda garantida, editor genérico, colaboração simultânea, sincronização, geração de imagens e funcionamento offline presumido. Exibir/preservar imagens e os três formatos completos permanecem no desenho; o fatiamento não os remove silenciosamente.

Não prometer receita, retorno, menor objeção, confidencialidade, qualidade ou prazo ainda não observados. Produto/serviço distinto pode exigir outro escopo; não pressupor integração com estoque, CRM, loja, anúncios, pagamentos ou rede social.

## Further Notes

- A entrega original de roteiro curto + prancha PNG foi alterada pelo autor; experimento original continua preservado. Preço/esforço antigos não são válidos para este app.
- As 36 histórias da baseline foram mantidas; novos contratos decorrem do debate, sem decisão humana inventada. A proposta de variar perfis/tarefas reabre a escolha comercial; não apaga P1 nem torna todos os públicos alvo simultaneamente.
- R$790 pertence à rodada inicial; R$690 é estímulo experimental. Com os custos hipotéticos e a sensibilidade técnica, o cenário de dez entregas ainda perde R$269–785 por unidade antes de custos não cotados. Não é preço sustentável demonstrado; piso, teto, custo e alocação precisam de medição.
- Permanecem abertos nicho prioritário, SO/distribuição, provedor/dados/rede/credenciais, persistência definitiva, exportação necessária, capacidade, orçamento, preço e condições do serviço. A próxima decisão é sobre descoberta delimitada; nada autoriza construir ou vender.
- A skill interna do produto não é a skill genérica `morphological-project-design` nem um pacote a executar em outro agente.
- Documentos: [oferta e economia](../servico/oferta-e-economia.md), [GTM e validação](../servico/gtm-e-validacao.md), [implementação](../servico/plano-implementacao.md), [variações de usuário/tarefa](../servico/variacoes-escopo.md), [debate e rastreabilidade](../debate/2026-10-20-rcd/README.md).
- Método: **Revenue-Centric Design, Richard (@richardrx)**, [fonte fixada](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68), [termos integrais](../debate/2026-10-20-rcd/RCD-LICENSE.txt). Prova antes da promessa, nicho, custo/valor e qualidade do sinal; não aplicar a apostas/cassinos/jogos de azar. Sem garantia de retorno financeiro. Licença do código futuro não escolhida.
