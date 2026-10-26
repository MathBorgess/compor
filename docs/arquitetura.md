# Arquitetura proposta do Compor V1

> Direção vigente de 26/10/2026: [arquitetura e decisões fechadas no Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258), [organização individual](adr/0002-organizacao-e-fluxo-individual.md) e [memória integral da organização](adr/0003-memoria-integral-da-organizacao.md). O fechamento inclui Windows e macOS, BYOK e Codex, geração de imagens desde a v0 e envio opcional de toda a memória ao GitHub. O texto abaixo preserva os contratos anteriores; suas restrições de plataforma, adiamento de imagens e exclusão genérica de nuvem foram substituídas nesses pontos. Instalação e integrações continuam sem comprovação de execução.

> Observabilidade adicionada em 26/10/2026: o [ADR 0005](adr/0005-observabilidade-centralizada-mlflow.md) amplia o papel da Oracle para centralizar traces e avaliações no MLflow, além da compatibilidade e do diagnóstico. A telemetria operacional permanece opcional e sem texto ou imagem; o contrato de coleta de conteúdo para avaliação depende de decisão explícita. A Oracle continua fora da geração e da composição. O limite histórico de apenas compatibilidade/diagnóstico abaixo foi substituído nesse ponto; capacidade e implantação não foram comprovadas.

> Atualização de 23/10/2026: a [spec consolidada](specs/compor-reestruturado-2026-10-23.md) passa a orientar promessa, qualificação, jornada por intenção, quantidade de rotas, ativação e hipótese comercial. Este documento preserva a proposta anterior e seus contratos técnicos não alterados. Três rotas + duas variantes deixam de ser obrigação; não há implementação ou validação humana demonstrada.

20/10/2026. Alvo: Electron para macOS, conta ChatGPT/Codex e backend Oracle com um processador e um gigabyte (GB) de memória. Matheus confirmou essas direções. Esta entrega descreve contratos; instalação, integração e capacidade continuam sem execução.

## Integração e condição comercial

O aplicativo terá sua própria identidade e conexão autorizada. O fluxo separa login da permissão de usar modelos. Copiar sessões, cookies ou credenciais de outro aplicativo fica fora do contrato.

A documentação encaminha aplicativos pagos ou remotos para avaliação. A elegibilidade do Compor privado permanece pendente. [Escopo oficial](https://developers.openai.com/siwc/token-sharing-open-source).

Os [termos de conexão](https://openai.com/policies/sign-in-with-chatgpt-terms/) exigem acesso ao uso do plano sem pagamento ou upgrade obrigatório no aplicativo. Também exigem persistir tokens localmente, sob controle do usuário. A proposta comercial precisa respeitar essas condições além de obter acesso.

**G0:** verificar a rota comercial e o que o Compor pode cobrar. Registrar resposta, condições e chamada sintética concluída. O login antigo do Codex fica fora das rotas de contorno. [Autenticação oficial](https://learn.chatgpt.com/docs/app-server#authentication).

Matheus confirmou em 20/10/2026: manter privado e validar acesso oficial antes de vender. Essa decisão mantém G0 como requisito anterior à oferta. Ela difere da confirmação de elegibilidade pelo fornecedor.

Sem G0, a demo apresenta conexão e resultados como simulação. Cobrar composição ou assistência permanece uma hipótese sujeita à confirmação de separação permitida. Uma interface de programação de aplicações (API) paga, outro fornecedor ou abertura do código dependem de nova decisão do autor. O plano preserva a direção pedida.

## Responsabilidades

| Parte | Trabalho proposto | Limite |
| --- | --- | --- |
| Interface | Base, blocos, visual, revisão e estados | Sem acesso direto a disco, tokens ou terminal |
| Processo principal | Arquivos, versões, exportação e conexão autorizada | Operações delimitadas e entradas validadas |
| Adaptador local de geração | Contexto permitido, chamada e resposta estruturada | Uma tentativa por usuário; fila local; ferramentas de execução desativadas |
| Compositor local | Prévia e arte final a partir dos mesmos blocos | Elementos e fontes fornecidos pelo aplicativo |
| Repositório local | Base, recursos, permissões e versões | Fora da nuvem por padrão |
| Backend Oracle | Compatibilidade e diagnóstico autorizado | Sem projetos, imagens, credenciais ou execução de modelos |

Proposta de interface: React com TypeScript. Versões de dependências ficam para o início autorizado da implementação. O processo da interface usa isolamento, sandbox e política restrita de conteúdo. A ponte entre processos valida operação, remetente, tamanho e estado. [Segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security/).

O modelo devolve dados num esquema limitado de texto e composição. A aplicação valida esses dados antes de montar a prévia. Scripts, marcação executável e instruções dentro de documentos permanecem conteúdo. O adaptador dispensa acesso de terminal, navegação livre e ferramentas externas.

## Interfaces e estados

Os contratos principais recebem versões explícitas do projeto. Salvar devolve uma versão durável; gerar devolve uma proposta; aplicar exige confirmação separada. Uma resposta atrasada para outra versão permanece disponível como alternativa, sem sobrescrever o trabalho atual.

A geração passa por preparada, autorizada, em curso, concluída, falha ou cancelada. Só uma conclusão válida cria alternativa revisável. Cancelar preserva o projeto; reenviar exige ação explícita. Limite, revogação e indisponibilidade mostram recuperação possível e eventual consumo observado.

Depois de G0, o adaptador pode usar Codex app-server como processo filho local. A comunicação usa entrada e saída padrão. O modelo vem do catálogo disponível e passa por verificação real. [Integração oficial](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

A rota consultada exclui geração de imagens. A primeira versão importa imagens autorizadas e gera texto ou composição estruturada. [Limites oficiais](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Modelo de projeto

Cada projeto mantém identidade, versão de esquema e versão ativa. A base distingue negócio, produto e divulgação atual. Os fatos têm estado confirmado, pendente ou omitido por escolha.

Blocos guardam texto, posição, ordem, cor, forma e referências a recursos. Decisões preservam alterações manuais, omissões e aprovações. Saídas registram sua base e o adaptador usado. A mudança de um fato cria proposta de revisão; ela preserva versões anteriores.

A skill interna contém instruções versionadas para trabalhar com essa base. Ela permanece separada de fatos, recursos e credenciais. O histórico do chat serve como apoio, sem assumir o papel de armazenamento principal.

## Campanha, rotas e variantes

A base aprovada guarda produto, voz, fatos, omissões e limites. A campanha referencia essa versão e acrescenta público, objetivo e hipótese. Cada rota contém tema, gancho, conceito, direção visual, composição, arte e legenda. Cada variante referencia sua origem e dimensão alterada.

Proposta de primeira rodada: três rotas e duas variantes de uma rota selecionada. A geração de cada rota parte da mesma base autorizada. A pessoa compara conceito e fidelidade separadamente; mudar só cores falha como diversidade. Aprovar uma rota preserva a base e suas irmãs.

Guardar versão da base, campanha, origem, tentativa, recursos e aprovações. Resposta atrasada permanece ligada à versão usada. Mudar voz ou produto pede revisão explícita das rotas afetadas. A escolha de uma variante preserva as demais e o histórico.

Uma fila local mostra tarefas previstas, em curso, concluídas, falhas e canceladas. Executar uma tentativa por vez. Cancelar ou falhar na segunda rota preserva a primeira. Informar chamadas e limites conhecidos antes da autorização; contar tentativas incompletas na medição de uso.

O compositor entrega arte com texto, formas, cores e imagens autorizadas opcionais. Uma direção que exige foto ou ilustração inédita por modelo mostra dependência pendente. Recursos provisórios recebem rótulo e ficam fora do aceite final. Gerar conceito ou prompt difere de entregar a arte utilizável.

Exportar os criativos selecionados, até cinco nessa rodada proposta, com arte e legenda por item. A cópia privada inclui todas as rotas, variantes, origens e versões. Compartilhar recursos por resumo criptográfico evita duplicar imagens por rota. Os tetos de pacote e entradas incluem alternativas e histórico.

Preferência interna por uma rota difere de desempenho no mercado. Notas de resultado identificam canal, período, hipótese e fonte. Publicação, orçamento de anúncios e métricas automáticas permanecem fora desta versão. O A/B de preço da v0 usa outro conjunto de registros.

## Imagens e recuperação

Os formatos candidatos são Portable Network Graphics (PNG) e Joint Photographic Experts Group (JPEG). Importar copia os bytes para o projeto. Esses formatos de imagem delimitam o primeiro importador. Guardar dimensões, origem e autorização declaradas. Um resumo criptográfico identifica os bytes e permite conferir integridade.

O projeto usa a cópia local. Mover o original ou perder um endereço externo preserva a imagem incorporada. Miniaturas servem à prévia, mantendo o original disponível para exportação. Imagem ausente gera aviso com identificação do recurso e opção de recuperar uma cópia.

Limites iniciais propostos: dez imagens, dez megabytes por imagem e vinte milhões de pixels por imagem. Cada lado aceita até 8192 pixels. O decodificador trabalha com uma imagem por vez e cria miniaturas de até 2048 pixels por lado. O pacote privado aceita até 250 megabytes e mil entradas, tanto compactadas quanto extraídas.

São tetos para teste, sem capacidade medida. Arquivos inválidos, dimensões excessivas e tipo incompatível recebem recusa explicada. O importador valida o conteúdo real do arquivo. Ao atingir um teto, recusar a nova entrada e preservar o projeto existente. Esclarecer o limite excedido; reduzir conteúdo exige escolha do usuário.

Salvar cria uma versão temporária e confere sua integridade. Só depois troca a referência ativa. Queda ou disco cheio mantém a última versão íntegra. Versões de esquema futuras abrem como incompatíveis, preservando o original. Migrações começam por uma cópia.

A cópia privada proposta usa pacote de arquivos (ZIP) com manifesto, base, blocos, versões e todos os recursos referenciados. ZIP é um contêiner de arquivos. A restauração cria outra pasta e verifica integridade antes de ativar o projeto.

O importador bloqueia caminhos externos, links simbólicos e expansão além dos limites. Uma cópia corrompida permanece preservada para diagnóstico. Recursos usados por versões mantidas sobrevivem à limpeza. Excluir um projeto exige ação explícita e explica o efeito sobre suas cópias.

O pacote privado guarda dados legíveis; ele difere do armazenamento protegido de credenciais. A interface alerta sobre isso antes do compartilhamento. Credenciais ficam fora de projetos, cópias, prompts e registros. O cofre do macOS exige teste no aplicativo assinado. [Armazenamento protegido do Electron](https://www.electronjs.org/docs/latest/api/safe-storage).

## Exportação proposta

Cada criativo selecionado exporta arte PNG de 1080 × 1350 pixels e legenda em texto simples (TXT). A codificação Unicode Transformation Format (UTF-8) representa caracteres, incluindo acentos. O compositor local atende prévia e exportação. Fontes fazem parte do pacote instalado e de sua licença própria.

Uma exportação incompleta preserva o arquivo anterior. Conferir texto, preço, datas, imagem, recorte e cores fora do aplicativo. O endereço de compra permanece acessível na legenda. A imagem exportada contém pixels, sem camadas editáveis em outro editor.

A cópia privada ZIP permite retomar a edição dentro do Compor. O material público recebe somente conteúdo aprovado para divulgação. A exportação pública exclui a base privada e metadados de origem das fotos. A conferência inclui esses metadados.

Documento portátil (PDF) e exportação editável externa ficam fora do primeiro exportador. Mavi testa se a dimensão candidata serve à tarefa. Uma exigência diferente reabre esse contrato antes de venda ou implementação do exportador.

## Dados e retenção

A autorização de uma tarefa externa difere da aprovação de divulgação. Antes do envio, mostrar fornecedor, finalidade, textos, imagens e limite ou custo conhecido. Dado marcado como somente local permanece fora de todas as chamadas. A edição manual continua disponível.

Por padrão, a geração textual envia apenas texto autorizado. Enviar imagem exige necessidade declarada e autorização própria. O fornecedor recebe esses dados diretamente do Mac. Suas regras de retenção precisam de verificação antes de conteúdo real.

Projetos, imagens e versões permanecem no Mac até exclusão explícita. A pasta do projeto mostra tamanho e local. Cópia de segurança é ação explícita; o app informa quando falta uma cópia. O backend deixa de ter filas de geração ou retenção de conteúdo.

Registros técnicos excluem textos, imagens e credenciais. Proposta: retenção de cinco dias, preservando incidente aberto com justificativa. Diagnóstico para suporte exige escolha e prévia dos campos. Telemetria de produto depende de adesão; o serviço funciona sem ela.

## Oracle e distribuição

Proposta: um serviço pequeno serve compatibilidade e recebe diagnóstico autorizado. A última configuração válida acompanha o app. Queda da Oracle preserva abrir, editar, recuperar e exportar. Cada pedido usa a conta autorizada do próprio usuário.

Tetos de ensaio propostos: resposta de 32 quilobytes e processo de 256 megabytes. Medir memória do sistema, disco, concorrência e reinício antes de confirmar capacidade. Inferência, renderização, exportação e arquivos dos clientes ficam no Mac e fora dessa máquina.

A matriz de Macs começa pelo equipamento de desenvolvimento, sem presumir cobertura. Registrar arquitetura e versão do macOS. Distribuição externa exige escolher compatibilidade, assinatura, notarização, custos e canal. O instalador deve funcionar com as proteções normais do sistema.

## Construção futura e testes

A [spec](specs/compor-macos-v1.md) define uma fronteira principal: aprovar base, explorar rotas, comparar, ramificar, selecionar, exportar e restaurar. Simulação verifica preservação; Inteligência artificial (IA) real verifica integração; pessoas independentes verificam uso; pagamento e repetição verificam negócio.

Ordem proposta: G0 acesso e escopo comercial; G1 imagens e persistência; G2 compositor e exportação; G3 geração; G4 distribuição; G5 piloto. [Aceites e demonstração](compor/demo-e-testes.md) detalham cada verificação.

Matheus conduz desenvolvimento; Mavi reforça design. Capacidade semanal e calendário continuam sem confirmação. A estimativa do antigo caso de oficinas permanece histórica e inaplicável a este recorte.

Método: **Revenue-Centric Design, Richard (@richardrx)**, com [termos integrais](debate/2026-10-20-rcd/RCD-LICENSE.txt). Custo e capacidade são hipóteses até medição.
