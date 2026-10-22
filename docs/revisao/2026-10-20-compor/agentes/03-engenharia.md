# Engenharia: fechar o caminho antes de prometer a integração

Data: 20/10/2026. Papel: engenheiro crítico. Este parecer propõe contratos e testes; a equipe ainda precisa executá-los.

Electron para macOS e a máquina Oracle, com um núcleo de processamento e um gigabyte de memória, são direções do autor. A capacidade permanece desconhecida. A integração inicial com a conta ChatGPT/Codex precisa passar por uma verificação comercial antes da distribuição paga.

## O risco que pode quebrar o negócio

Ter uma assinatura ChatGPT e conseguir executar uma chamada são evidências diferentes da autorização para oferecer um aplicativo comercial. A documentação atual reserva a integração comercial a parceiros selecionados. O acesso do Compor continua sem confirmação. [Quickstart oficial](https://developers.openai.com/siwc/quickstart).

O guia de uso do plano cobre aplicativos abertos e locais. Para oferecer esse uso em aplicativo pago ou hospedado remotamente, a OpenAI indica um formulário de interesse. Manter o código privado pode exigir aprovação específica. [Escopo da integração](https://developers.openai.com/siwc/token-sharing-open-source).

O login antigo do Codex app-server serve para aplicações locais ou abertas. A documentação exclui seu uso em serviços comerciais ou hospedados. Então, essa autenticação fica fora das alternativas para contornar a análise comercial. [Autenticação do app-server](https://learn.chatgpt.com/docs/app-server#authentication).

Os termos atuais exigem que a pessoa consiga usar seu plano por Sign in with ChatGPT (SIWC) sem pagar ou contratar uma versão superior. Eles também exigem tokens persistentes locais, sob controle do usuário. As chamadas partem do ambiente local ou de ambiente remoto controlado somente por aquela pessoa. [Termos oficiais, seções 1 e 2](https://openai.com/policies/sign-in-with-chatgpt-terms/).

Cobrar por geração, material ou licença obrigatória pode contrariar essa condição. Separar remuneração por editor ou assistência permanece uma hipótese para confirmar. Esse ponto exige análise específica; este parecer evita concluir conformidade jurídica.

Proponho um portão G0: registrar a resposta oficial sobre o Compor privado, pago e desktop. Incluir a separação entre uso gratuito do plano, editor e assistência na consulta. Antes desse resultado, a demo pode mostrar dados sintéticos e resultados preparados, com essa condição explícita. A demo apresenta a conexão como dependência pendente.

Se faltar acesso, Matheus decide entre aguardar, negociar acesso ou avaliar outra rota. Interface de programação de aplicações (API) paga, abertura do código e troca de fornecedor exigem nova decisão. Este parecer propõe investigar essas opções. Ele preserva a direção inicial do autor.

## Integração proposta após G0

Usar Sign in with ChatGPT, que separa identidade e permissão de uso do plano. O aplicativo mantém seu próprio registro autorizado. Copiar credenciais de outro aplicativo ou ler seu `auth.json` fica fora do contrato.

O processo principal começa o fluxo autorizado, valida o retorno e guarda os segredos no armazenamento protegido do macOS. A interface recebe estado da conta, permissões e erros, sem receber tokens. A OpenAI exige proteger credenciais e mantê-las fora de registros e atendimento. [Contas e sessões](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

Se a equipe escolher Codex app-server como adaptador, usar processo filho local e comunicação por entrada e saída padrão. Ele recebe somente o token próprio autorizado. O catálogo de modelos ajuda a montar a interface; uma resposta concluída confirma acesso naquela chamada. [Adaptador oficial](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

Proponho começar com texto e sugestões de composição estruturadas. A prévia atual dessa rota exclui geração de imagens. Imagens fornecidas pelo usuário continuam como recursos locais. A chamada usa `store: false` e `stream: true`, conforme o contrato atual. [Limitações da prévia](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

O adaptador precisa distinguir conclusão, cancelamento, falha, permissão ausente e limite atingido. Cada tentativa requer decisão explícita quando consumir uso adicional. Mostrar limite desconhecido quando o fornecedor deixar esse dado indisponível. A interface distingue estimativa e cobrança observada.

## Partes do aplicativo e interfaces

Proponho quatro partes com responsabilidades pequenas:

| Parte | Contrato proposto |
| --- | --- |
| Interface | Editar blocos, fatos, imagens e escolhas; mostrar sugestões e diferenças |
| Processo principal | Autorizar arquivos, salvar versões, exportar e coordenar chamadas |
| Adaptador de geração | Preparar contexto permitido, executar uma tarefa e devolver dados validados |
| Serviço Oracle | Informar compatibilidade, estado do serviço e instruções públicas de suporte |

Entre interface e processo principal, usar comunicação entre processos (IPC). Expor operações como `project.save`, `asset.import`, `generation.start`, `generation.cancel` e `export.create`. Validar conteúdo, remetente, tamanho e estado em cada operação. O renderer, processo da interface, fica sem acesso direto ao sistema de arquivos.

A resposta do modelo descreve blocos dentro de um esquema limitado. O aplicativo compõe esses blocos com modelos locais. Marcação de páginas, scripts, comandos e instruções vindos do conteúdo permanecem dados. O motor de geração fica sem ferramentas de terminal, navegação ou acesso livre a pastas.

## Papel útil da Oracle

A máquina inicial pode servir uma versão pública da configuração compatível e um estado de disponibilidade. O app usa a última configuração válida quando esse serviço falhar. Abrir, editar, recuperar e exportar projetos existentes depende apenas dos recursos locais.

Proponho processo único, respostas pequenas e concorrência limitada. Inferência, composição, exportação, imagens, projetos, credenciais e filas de tarefas permanecem fora desse servidor. A exportação de imagens ao backend fica fora do contrato. Isso reduz trabalho operacional e exposição de dados. O backend continua útil para comunicar mudanças de compatibilidade e orientar suporte.

Como hipótese inicial, limitar cada resposta a 32 quilobytes e reservar 256 megabytes ao processo. Esses números são tetos para experimentar, sem medição atual. Testar concorrência sintética, memória máxima, erros e retomada após reinício. Registrar também espaço em disco e recursos consumidos pelo sistema operacional.

Proponho registros técnicos por cinco dias, com horário, versão, código de resposta e duração. Excluir conteúdos, imagens, identificadores pessoais e textos das chamadas. Avaliar limites de armazenamento e descarte antes do piloto. Telemetria de produto exige decisão própria e adesão explícita. Enviar dados para atendimento exige seleção e conferência próprias.

## Exportação e projeto recuperável

Proponho Portable Network Graphics (PNG), imagem raster sem edição de blocos. Acompanhar com arquivo de texto simples (TXT), em Unicode Transformation Format (UTF-8). O candidato inicial é uma peça vertical de 1080 por 1350 pixels. Essa dimensão segue a recomendação comum desta rodada. Dimensão e formato precisam de teste com Mavi e usuários. Portable Document Format (PDF), exportação editável e outros formatos continuam fora desse compromisso inicial.

A exportação local usa o mesmo compositor da prévia. Conferir fontes, quebras, recorte, cores, texto de apoio e endereço de compra no arquivo final. Preservar o arquivo anterior até concluir o novo. Uma falha deixa o projeto e a versão aprovada intactos.

Proponho um pacote portátil de projeto com manifesto, contexto, blocos, versões e recursos. O manifesto declara versão do esquema e relações entre imagens e blocos. A skill interna preserva instruções e escolhas aprovadas. Ela permanece separada dos dados e dispensa execução de código arbitrário.

Ao importar uma imagem, copiar seus bytes para o projeto e calcular seu resumo criptográfico. O resumo identifica conteúdo e permite verificar integridade. Guardar nome original, origem declarada, autorização e dimensões. A imagem recuperável usa a cópia local, dispensando o caminho original ou um endereço temporário.

Gravar uma nova versão em área temporária, conferir integridade e trocar o índice ativo somente ao concluir. Manter a versão anterior disponível. Ao abrir versão de esquema desconhecida, preservar o original e explicar a incompatibilidade. Migrações criam cópia recuperável antes de alterar dados.

O pacote privado contém dados legíveis. O cofre protege credenciais; a interface explica essa diferença antes de copiar ou compartilhar projetos. A cópia de segurança inclui todos os recursos e exclui credenciais. Restaurar em pasta separada, conferir resumos e mostrar imagens ausentes. Barrar caminhos externos, links simbólicos e arquivos excessivos em pacotes importados. A exclusão de recursos exige confirmar ausência de referências em versões preservadas.

## Segurança e custo de suporte

Ameaças principais: conteúdo malicioso, imagem inválida, resposta manipulada, perda de arquivos e vazamento por registros. Proponho contexto isolado, sandbox, política restrita de conteúdo e navegação bloqueada por padrão. Validar destinos antes de abrir links externos. [Segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security/).

O armazenamento de segredos pode usar `safeStorage`, com proteção pelo Keychain do macOS. A assinatura consistente do aplicativo ajuda a manter o reconhecimento desse acesso entre versões. A equipe precisa verificar esse comportamento no pacote distribuído. [Armazenamento protegido](https://www.electronjs.org/docs/latest/api/safe-storage).

Antes de dados reais, fechar retenção, registros, atendimento, cópias e exclusão. Conteúdo marcado como somente local precisa permanecer fora de cada envio externo. A autorização da chamada continua separada da aprovação para divulgação.

Revenue-Centric Design (RCD) pede medir a ação que entrega valor. Aqui ela inclui criar, revisar, exportar e recuperar o material. Medir instalação, espera, falhas, revisão e ajuda humana. Cliques em gerar e inscrições na lista medem interesse; venda, repetição e margem precisam de evidência própria.

## Fatiamento e critérios para avançar

| Etapa | Evidência exigida antes de avançar |
| --- | --- |
| G0: acesso e cobrança | Confirmar elegibilidade, uso gratuito do plano e separação comercial; concluir chamada sintética pela rota autorizada |
| G1: persistência | Projeto reabre com imagens após mover os originais; cópia restaura em outra pasta |
| G2: composição | Prévia e exportação coincidem; mudança de preço preserva omissão e versão anterior |
| G3: integração | Revogação, limite, cancelamento e falha preservam trabalho; segredos ficam ausentes dos registros |
| G4: distribuição | Pacote macOS instala, abre e restaura; assinatura e notarização têm caminho e custo aceitos |
| G5: piloto | Política de dados fechada, teste independente e custo completo por material observado |

Testar contratos nos limites entre partes. Usar fornecedor simulado para falhas repetíveis e uma verificação real separada da integração. Testar queda durante gravação, disco cheio, pacote corrompido e imagem ausente. Registrar sistema macOS, arquitetura, versões e resultado de cada teste.

A matriz de Macs suportados depende desses testes. Instalação no computador do autor prova apenas aquele ambiente. Todos os marcos acima seguem pendentes de execução. Este documento contém especificação; implementação, acesso à Oracle e distribuição continuam fora desta entrega.

## Fontes e termos

Consultei e abri as fontes oficiais em 20/10/2026. Elegibilidade e limitações podem mudar; conferir novamente antes do piloto.

Planejamento comercial baseado em Revenue-Centric Design, de Richard (@richardrx): [fonte fixada](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68). Preservar os [termos integrais](../../../debate/2026-10-20-rcd/RCD-LICENSE.txt), inclusive a exclusão de apostas, cassinos e jogos de azar.

As referências locais de métricas e preço orientam hipóteses. Elas dispensam importar metas de outros negócios como prova deste produto. Receita e disposição a pagar continuam desconhecidas.
