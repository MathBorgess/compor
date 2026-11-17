# PNGs locais no planejamento e nos lotes paralelos

**Atualização de 17/11/2026:** Matheus aprovou implementar o desenho e depois ampliou as referências do GPT Image para candidatas externas/geradas já selecionadas pela pessoa e triadas pelo Agents API, preservando todos os uploads selecionados como obrigatórios. O [ADR 0066](../adr/0066-entradas-visuais-e-triagem-vinculadas-ao-pedido.md) registra os contratos v1/v2, a seleção assinada e o bloqueio de candidatos enquanto faltar uma fonte autoritativa de autorização. O texto abaixo preserva a proposta revisada na ocasião; a restrição inicial a uploads foi substituída somente nos termos dessa decisão posterior. Não houve autorização de publicação ou chamada paga.

**Desenho para revisão; não implementado.** Matheus definiu nesta conversa: usar somente imagens carregadas do computador e selecionadas para o pedido; cópia otimizada é aceita; “terra” significa geração de arte. Aplicar a seleção a chat, planejamento e arte, incluindo as três propostas paralelas, exige congelar os arquivos antes do primeiro efeito pago e vincular seu conteúdo e ordem às provas. Enviar somente IDs ou descrições não atende ao pedido. As decisões de produto estão esclarecidas; a implementação aguarda revisão deste desenho.

Data: 17/11/2026. Fonte: pedido nesta conversa do Codex para preparar o desenho antes da implementação. Base inspecionada: `b1a20d8`, complementada pela leitura dos commits integrados `df21a87` (fidelidade do chat) e `df07ff4` (orientação EXIF). Este documento não autoriza chamadas pagas, publicação, migrations remotas ou mudança de gates. Os caminhos abaixo descrevem código local, não comportamento comprovado em produção; as diferenças posteriores à base estão identificadas.

## 1. Decisões recebidas e escopo

Permanecem as três propostas com prompts diferentes produzidos pelo agente, início concorrente sem intervalo deliberado entre filhos e espera de 15 segundos após três imagens confirmadas. Permanecem o gate após duas rodadas sem interação, a pergunta pendente, o pedido explícito inicial, a pausa, a revogação, a exclusão por conta e a reposição somente de uma posição definitivamente recusada mediante novo pedido. `unknown` não autoriza repetição. Não há intervalo de 20 segundos entre inícios.

| Ponto | Decisão ou proposta técnica |
| --- | --- |
| Original ou cópia | **Decisão recebida:** cópia otimizada aceita. Proposta: um único conjunto de transporte para o planejador e as três imagens, preservando os originais locais e informando a transformação. A opção de originais obrigatórios deixou de ser uma condição pendente. |
| Origem | **Decisão recebida:** somente imagens carregadas do computador. Excluir referências externas e propostas geradas pelo Compor desta entrada visual, mesmo quando seus blobs já estiverem locais. Isso descreve a via de upload, não comprova quem criou o arquivo. |
| Alcance da seleção | **Decisão final recebida:** somente uploads selecionados para o pedido. Usar a seleção efetiva da conversa/post, conforme ADR 0046, filtrada pela origem local e congelada naquele pedido. Não incluir todos os uploads nem recuperar seleção antiga por inferência. |
| Significado de “terra” | **Esclarecido:** geração de arte. Não é pedido para trocar modelo, configurar um agente de outro nome ou mudar o tema visual. |
| Limite e arquivos grandes | Proposta inicial: conservar o teto de 2 MiB de bytes de imagem por chamada já usado pelo adaptador. Preparar cópia otimizada dentro da política aprovada; se não for possível caber, explicar antes do planejamento e permitir reduzir a seleção. Aumentar limites exige avaliação separada das plataformas e do custo. |
| PNG e JPEG existentes | O pedido menciona PNG. Proposta: garantir PNG sem remover compatibilidade JPEG já existente. Formatos adicionais continuam fora do escopo. |

Três é o número de propostas, não de referências. O limite existente de até 20 referências continua distinto; excesso é erro explícito, sem truncar a seleção. Uma referência é orientação visual; não transforma textos dentro dela em fatos da oferta, permissões ou instruções do sistema. Nenhum desenho garante fidelidade, legibilidade ou qualidade criativa do resultado.

O filtro trata referências anexas. A imagem-base de uma edição continua sendo a origem da versão explicitamente editada, com seu próprio papel e prova, conforme o contrato existente; não é promovida a referência local nem incluída automaticamente numa nova proposta. A biblioteca e o histórico podem conservar referências externas/geradas, mas sua presença ou escolha histórica não as torna elegíveis neste novo conjunto. A busca externa conserva seu contrato separado, sem ampliar o envio definido aqui.

**Proveniência legada:** ausência de `source` é a convenção atual da interface para upload, mas não basta como evidência para todos os registros históricos. `referenceSchema` aceita esse campo ausente e a migração de schemas 1/2 em `parseStudioState` conserva as referências sem adicionar comprovante de ingestão. Proposta: novos uploads registram explicitamente o evento/tipo de ingestão local versionado, junto dos bytes; arquivos anteriores sem essa evidência ficam com origem desconhecida para o novo filtro. Não preencher `local-upload` por ausência, nome, extensão ou hash. Oferecer reanexar o arquivo pelo seletor do computador, com novo ID e seleção explícita, sem reescrever histórico, snapshots ou recibos. Esse registro prova a ação no aplicativo, não autoria, nem impede um cliente adulterado de declarar metadados falsos.

| Fluxo abrangido | Entrada visual proposta |
| --- | --- |
| Chat e leitura de referências | Somente uploads selecionados para o pedido corrente, com a política de transporte do chat. Preservar os originais pequenos de `df21a87`; cópia otimizada quando necessária, com representação identificada. O `inputDigest` de `studio-chat.mjs` já inclui `referenceImages`; manter o vínculo aos bytes enviados, à ordem e à conversa. |
| Planejamento das propostas | Mesma seleção de originais locais congelada para o lote, entregue como entrada multimodal; saída continua sendo o plano textual de três prompts. |
| Arte individual | A aplicação determina o conjunto completo dos uploads selecionados para o pedido; o agente não pode omitir referências nem escolher um subconjunto vazio. IDs extras, ausentes, reordenados ou de outra fonte são recusados antes da prova/execução. Edição mantém sua base separada. A cópia aprovada não altera originais nem origem da versão. |
| Três propostas e reposição | Todas as três chamadas recebem o conjunto de transporte congelado do lote na mesma ordem. A reposição de posição recusada recebe esse mesmo conjunto, sem anexar seleção posterior. |

Compartilhar a resolução pura da seleção e a descrição das representações evita filtros diferentes em cada fluxo. O chat pode conservar seu limite menor por imagem; não reutilizar sua cópia reduzida na arte por conveniência. Caso use representações distintas, cada operação vincula a sua, junto do hash do original local e da política de transformação. Isso não cria um novo turno de chat obrigatório antes do planejador.

## 2. Evidência atual e lacunas

| Camada | Fato observado na base | Consequência |
| --- | --- | --- |
| Biblioteca e escopo | [ADR 0046](../adr/0046-contexto-e-referencias-por-post.md) e [studio-storage.ts](../../apps/web/lib/studio-storage.ts): biblioteca local por conta/projeto, compartilhadas e locais por post; seleção efetiva deduplicada. Originais ficam no IndexedDB. [reference-selection-tray.tsx](../../apps/web/app/reference-selection-tray.tsx), `referenceOrigin`, rotula `source` ausente como upload, `source.originUrl` como externa e `source.kind` como gerada. `addFiles` em [studio-app.tsx](../../apps/web/app/studio-app.tsx) omite `source` no upload atual. | Esse rótulo não comprova a ingestão de todo legado. O novo filtro exige evidência explícita de ingestão local e seleção do pedido, sem apagar `source` nem inferir origem da presença de blob. |
| Chat, atualizado por `df21a87` | [studio-reference-images.ts](../../apps/web/lib/studio-reference-images.ts) preserva bytes e MIME dos PNG/JPEG com até 512 px em cada dimensão e 35 KiB; arquivos maiores continuam usando JPEG reduzido com fundo branco. [studio-chat.mjs](../../packages/agents-api/src/studio-chat.mjs), `inputContent`, envia blocos `input_text` e `input_image` à Agents API gerenciada. | O ADR 0065 e esse commit substituem a conversão incondicional presente em `b1a20d8`. Há precedente local para entrada original pequena e cópia maior; isso ainda não transmite arquivos no planejador paralelo. |
| Arte individual | [studio-artwork-input.ts](../../apps/web/lib/studio-artwork-input.ts), `prepareArtworkTransport`, mantém originais PNG/JPEG quando cabem; acima do orçamento exige autorização para cópias locais. [artwork-input.mjs](../../packages/agents-api/src/artwork-input.mjs) vincula texto, origem, IDs, papéis e hashes dos bytes em ordem. | Reutilizar contratos puros e a distinção entre original e cópia; não reutilizar cegamente o snapshot de edição com uma imagem-base. |
| Planejamento paralelo | [exploration-plan-contract.mjs](../../packages/agents-api/src/exploration-plan-contract.mjs) aceita apenas contexto textual; [exploration-plan-provider.mjs](../../packages/agents-api/src/exploration-plan-provider.mjs) envia `input: JSON.stringify(context)`. | O agente não recebe os PNGs neste caminho. O contrato precisa de versão nova e anexos separados do texto. |
| Imagens paralelas | [exploration-batch-runtime.ts](../../apps/web/lib/exploration-batch-runtime.ts), `generate`, envia somente prompt ao adaptador. | Hoje o lote usa geração sem imagens de entrada. Passar referências apenas ao planejador seria uma implementação incompleta. |
| Provedor de imagens | [packages/images-api/src/index.mjs](../../packages/images-api/src/index.mjs) aceita até 21 PNG/JPEG e 2 MiB agregados; com imagens envia `image[]` multipart em ordem a `/images/edits`, sem imagens usa `/images/generations`. | Há um mecanismo local reutilizável. No novo fluxo serão até 20 referências, sem uma base implícita. O nome `/edits` não torna a primeira referência uma arte-base aprovada. |
| Provas e recuperação | [exploration-planner.mjs](../../packages/agents-api/src/exploration-planner.mjs), [exploration-intent.ts](../../apps/web/lib/exploration-intent.ts), [exploration-batch-route.ts](../../apps/web/lib/exploration-batch-route.ts) vinculam contexto, plano, fonte/chave e escopo, mas não anexos. | Imagem, ordem ou cópia alteradas precisam invalidar esses vínculos, inclusive na reposição e na retomada protegida. |
| Journal | [parallel-exploration-journal.ts](../../apps/web/lib/parallel-exploration-journal.ts) conserva preparações, lotes e claims de reposição, sem snapshot dos blobs de entrada do lote. | Referenciar somente o arquivo mutável da biblioteca não permite provar qual conteúdo foi enviado nem recuperá-lo após remoção. |

As validações de servidor de arte e Images verificam forma, base64 canônico, assinatura de formato, quantidade e tamanho; isso não equivale a decodificar completamente todo arquivo. O navegador possui validação de dimensões. O commit posterior `df07ff4` permite a troca de eixos pelo decoder quando há orientação EXIF válida que a explique, sem regravar o original; a comparação incondicional de largura/altura da base foi substituída. Testes novos devem preservar essa correção e distinguir os níveis de validação, inclusive PNG truncado, dimensões extremas e orientação; não declarar que um arquivo é plenamente decodificável apenas porque começa com a assinatura PNG.

## 3. Alternativas de transporte

| Alternativa | Benefício | Limite ou custo |
| --- | --- | --- |
| A. Mesmo original em ambos os estágios | Prova simples: cada entrada do agente e das três imagens corresponde aos mesmos bytes e ordem; preserva alpha e metadados do arquivo enviado. | Arquivos grandes podem exceder o envelope; mais bytes não garantem melhor resultado. O serviço pode processar internamente a imagem de outra forma. |
| B. Mesma cópia autorizada em ambos | Mantém um conjunto único e verificável, com orçamento menor; original continua local. | A transformação pode mudar pixels, alpha, orientação e detalhes. Exige prévia e escolha explícita; não apresentar como original. |
| C. Prévia no planejamento, original/cópia maior na geração | Permite orçamento diferente por estágio. | O agente planeja a partir de outra representação. Vincular os dois conjuntos e identificar essa diferença; aumenta contratos, testes e possibilidade de divergência. |
| D. Arquivo remoto reutilizável | Pode evitar transmitir base64 do navegador em cada operação. | Acrescenta armazenamento remoto, retenção, acesso, limpeza, possível custo e recibos de upload. Não é a extensão mínima do contrato local; exige desenho e decisão próprios. |

Após a aceitação de cópia otimizada, a recomendação é B com o mesmo conjunto nos dois estágios, reutilizando bytes originais quando já atenderem à política. Não acrescentar confirmação por imagem ou por lote: informar a política e suas transformações, preservando o pedido explícito de geração existente. A política deve preservar transparência em PNG quando presente, tratar a orientação de forma consistente e limitar dimensões/bytes; transformar alpha em fundo branco não é uma otimização neutra. Os parâmetros exatos precisam de fixtures e avaliação de orçamento antes da implementação, sem prometer equivalência visual. Não escolher C por reaproveitar automaticamente a função de miniaturas do chat. Reencodar uma cópia em cada retomada também é incorreto: o encoder pode produzir outros bytes. Preparar uma vez e congelar o resultado.

## 4. Manifesto e vínculo de conteúdo

Criar um contrato versionado compartilhado, sem base64 dentro do contexto textual. A forma a seguir é conceitual; nomes finais dependem da revisão:

```text
visualInput = {
  version,
  policy: original | approved-copy | split-representations,
  entries: [
    {
      referenceId, ordinal, role: reference, inputOrigin: local-upload,
      original: { sha256, mime, byteLength },
      planner: { sha256, mime, byteLength, width, height },
      generation: { sha256, mime, byteLength, width, height },
      transformation: null | { version, parameters }
    }
  ]
}
```

O escopo autenticado é separado e inclui conta, projeto, conversa, lote e tentativa; uma declaração do manifesto não substitui titularidade. Ordinais são contíguos e IDs únicos; a ordem é a da seleção congelada e não é reordenada por nome, tamanho ou hash. O contrato valida campos exatos, limites e normalização antes de serializar. Campos de transformação são uma enumeração limitada, nunca comandos executáveis.

Cada servidor que recebe bytes decodifica o base64 canônico e recalcula SHA-256, tamanho e formato antes de reservar ou enviar efeitos. Dimensões e limite de pixels exigem validação com recursos limitados, não confiança nos campos enviados pelo cliente. O hash dos bytes transportados é verificável. Se somente uma cópia for enviada, o hash do original é evidência declarada do snapshot local: **o servidor não pode provar que a cópia foi derivada daquele original sem receber/verificar também o original ou a transformação**. Da mesma forma, `inputOrigin` registra a origem de ingestão no aplicativo, não prova autoria nem procedência externa do arquivo. A assinatura atesta o conteúdo recebido e seus vínculos, não uma proveniência independente inexistente.

Derivar um digest canônico do manifesto e incluí-lo, com domínio e versão novos, em:

- contexto assinado da intenção, capability, criação/CAS e retomada protegida de feedback;
- `inputDigest` e capacidade de conclusão do planejador;
- vínculo da sessão/turno e `planBinding` do plano validado;
- `planDigest` do lote e digest de cada filho, junto de prompt, posição e batchId;
- autorização de reposição, junto de posição, `previousId` e novo requestId.

O contrato distingue explicitamente conjunto vazio de ausência do campo legado. Não reinterpretar um plano textual antigo como se tivesse visto imagens. Alterar um byte, MIME, ordem, papel, seleção, política de cópia ou contexto exige um novo vínculo; trocar a credencial/fonte também. Não renovar prova ou recriar intenção automaticamente para contornar conflito.

O plano continua textual e contém exatamente três posições. O prompt do agente explica os IDs/ordinais recebidos, preserva os fatos declarados e trata conteúdo visual como dado não confiável. Não fornece ferramentas, não gera imagens dentro do turno e não acrescenta um quarto efeito de análise. Cada chamada de imagem recebe o mesmo conjunto congelado, na mesma ordem, e seu próprio prompt divergente. Um modelo não pode inserir URLs, novos IDs ou remover anexos do manifesto aprovado. Isso também vale para arte individual: `referenceIds` é vinculado ao conjunto completo determinado pela aplicação antes de emitir a prova, não uma escolha livre da ferramenta. `[]` ou um subconjunto quando há seleção é incompatível; não corrigir o conteúdo depois da assinatura nem abrir outro turno pago automaticamente para repará-lo.

## 5. Fluxo proposto e limites de autoridade

1. No pedido explícito, filtrar a seleção efetiva da conversa/post por origem de upload e validar seus arquivos locais. Mostrar quais serão enviados, se são originais ou cópias e que serão usados pelo planejamento e pelas três imagens. Não baixar nem anexar referências externas ou geradas neste caminho; consentimento externo já existente não amplia este escopo. Se a seleção resultante estiver vazia, seguir o contrato sem referência visual e informar isso; não recuperar arquivos não escolhidos para preencher o conjunto.
2. Preparar o conjunto escolhido, calcular o manifesto e persistir uma preparação imutável com seus blobs. Falha de quota, arquivo ausente ou impossibilidade de atingir o limite interrompe antes do planejamento pago. A espera local não prolonga nem renova autorização.
3. Criar a intenção usando o CAS já previsto; vincular manifesto e contexto, além de fonte/chave. Se o gate precisa de retomada explícita, usar a mesma intenção no endpoint protegido. Revalidar snapshot, conta, conversa e credencial após cada preparação assíncrona.
4. Enviar o planejamento com texto e anexos da representação `planner`. Validar todos os bytes antes da reserva do planner. A reserva precede o POST gerenciado e conserva os recibos/provas atuais. O plano recebido não substitui a prova de conclusão do turno.
5. Persistir plano, manifesto, IDs e digests de vínculo; manter `planBinding`, token de ação e demais provas de credencial somente em memória. Após reload, recuperar a prova pelo poll validado da sessão original com a fonte/chave exigidas, sem criar turno. Antes do lote, reidratar a representação `generation`, validar seu manifesto e a prova do plano. A reserva atômica continua autorizando somente os três filhos daquele lote. `store.plan` e a checagem de intenção antes de cada envio continuam no caminho de cada filho.
6. Despachar as três chamadas concorrentes com entradas imutáveis. Persistir cada sucesso/recusa/incerteza individualmente; respostas fora de ordem seguem revisões monotônicas e não sobrescrevem terminais. Os 15 segundos começam no último sucesso confirmado, preservando o gate de duas rodadas.

O manifesto pode acompanhar intent/resume como metadados pequenos; os bytes são exigidos nas rotas que vão iniciar o efeito. Criar uma intenção não prova que os arquivos já foram enviados ao provedor. O servidor precisa verificar os bytes reais novamente em `plan submit`, `execute` e `replace`; não basta confiar no hash informado pelo navegador.

Pausar ou sair revoga a autoridade com os mesmos lock e CAS dos ADRs 0061/0063/0064. Revogação vencedora impede admissão; admissão vencedora conserva o compromisso e seus recibos. A checagem antes de cada envio reduz envios ainda pendentes, mas não torna a transação SQL atômica com a rede. Abort, fechamento da aba ou timeout não comprovam cancelamento no fornecedor. Nenhuma nova espera temporal libera `unknown`.

## 6. Persistência, privacidade e recuperação

Acrescentar ao journal local um snapshot de anexos por proprietário/projeto/conversa/lote, com blobs imutáveis e manifesto; manter as cópias separadas dos originais da biblioteca. A preparação e seus anexos precisam de uma gravação transacional, ou de um estado incompleto que jamais seja elegível para despacho. A biblioteca e o journal são bancos distintos hoje: não prometer uma transação entre eles. Proposta mínima: copiar os blobs necessários para a mesma transação do journal, preservando a biblioteca. Deduplificação local é uma otimização posterior com contagem de referências e testes de retenção.

Persistir os arquivos congelados aumenta o armazenamento local. Calcular a ocupação e tratar quota antes do envio; não apagar histórico ou arquivos para caber. A versão de IndexedDB, migração e fechamento de conexões antigas devem preservar preparações e claims existentes. A migração do estado de referências introduz a ingestão explícita sem atribuí-la ao legado desconhecido, arquiva o estado anterior e impede leitores antigos de descartarem o campo silenciosamente. Arquivos usados por tentativas ou versões não são removidos por desmarcar uma referência. Limpeza futura precisa respeitar evidência pendente e política de retenção aprovada.

| Situação | Comportamento proposto |
| --- | --- |
| Reload com snapshot intacto | Consultar a mesma tentativa/lote e conservar anexos, IDs e hashes. Nenhum POST pago é repetido por reload. |
| Blob removido/evicto | Manter consultas dos recibos e resultados disponíveis. Bloquear despacho/reposição que precise do arquivo; explicar a indisponibilidade. Não substituir pela miniatura, seleção atual ou arquivo de mesmo nome. |
| Plano em curso/concluído | Poll consulta a sessão vinculada por GET no fornecedor, com contexto e manifesto já congelados; não exige reenviar imagens. A reconciliação pode escrever `store.finish` ao observar conclusão/falha com a prova exigida, como no fluxo atual: não é um endpoint inteiramente sem escrita. Replays de plano já concluído não repetem essa finalização nem criam turno. Se a prova ou credencial original necessária não estiver disponível, conservar incerteza e consultas locais possíveis. |
| Resposta perdida de execute | Consultar cada receipt do mesmo batchId/requestId. Não recriar os três efeitos, mesmo que os arquivos ainda existam. |
| Reposição de recusa definitiva | Novo pedido, nova intenção e novo ID ligados ao recusado; mesmo plano e mesmos bytes/ordem de geração. Reenvia somente aquele filho. Alterar referências exige outro planejamento autorizado, sem sobrepor pendência. |
| Mudança posterior da seleção | Orienta pedidos futuros, sem reescrever snapshot nem atribuição dos sucessos anteriores. |
| Legado sem evidência de upload | Mostrar origem desconhecida e excluir de novos anexos até reanexação explícita. O registro antigo e seus vínculos permanecem; não converter a reanexação em repetição de um efeito pendente. |
| Outro dispositivo | Pode ler metadados/resultados já disponíveis com a identidade adequada; não possui automaticamente os anexos locais. Sincronizá-los é outra decisão. |

Reanexar arquivo perdido poderia recuperar apenas os bytes exatamente iguais ao hash esperado, em ação explícita; não recupera a credencial nem autoriza repetir uma tentativa incerta. Se essa reparação não for implementada no primeiro incremento, manter a operação bloqueada com explicação e acesso à recuperação de leitura.

Não persistir chave BYOK, `planBinding`, token de ação ou capability secreta no journal/storage local. IDs, manifesto e digests não substituem essas provas e podem ser duráveis. Não guardar base64, prompts ou esses segredos em metadados operacionais. A cópia durável da aplicação para os anexos de entrada permanece local; eles não são acrescentados ao banco SQL nem ao storage remoto de resultados por este desenho. Processamento transitório no servidor e envio ao fornecedor continuam necessários; “armazenamento local” não significa que a imagem nunca sai do dispositivo nem que o fornecedor deixa de retê-la. Verificar e documentar o contrato de retenção do serviço escolhido antes da ativação, sem inferi-lo do uso de BYOK. Logs não recebem conteúdo visual, texto criativo ou chave.

BYOK segue em memória, sem fallback quando presente; a chave padrão continua resolvida somente no servidor após identidade/propriedade e intenção explícita. Trocar fonte/chave invalida continuidade, sem liberar pendências. Resultado já salvo continua acessível segundo autorização de leitura, sem exigir um novo efeito pago.

## 7. Limites de payload, recursos e custo

Na base, `plan`, `intent` e `resume` usam limite de 65.536 bytes; `execute`/`replace`, 262.144. Os wrappers de credencial e handlers internos têm seus próprios limites. O adaptador de imagem limita JSON a 3 MiB e imagens decodificadas a 2 MiB. Alterar apenas o schema do planner não faria os PNGs atravessarem essas camadas.

Dois MiB brutos tornam-se 2.796.204 bytes em base64 antes do JSON, manifesto, texto e chave injetada pelo wrapper. Portanto o novo teto deve separar bytes brutos, dimensão/pixels, soma de anexos e envelope HTTP; não usar comprimento de string como tamanho de arquivo. Manter `intent`/`resume` e poll com metadados pequenos quando possível, sem transportar anexos desnecessariamente. Se usados JSON/base64 para submit e execução, validar o envelope completo antes do primeiro efeito e ajustar as duas camadas de leitura, não apenas uma.

Antes de escolher o teto final, verificar limites documentados e atuais do deploy, do transporte gerenciado Agents e do modelo em uso, além de memória/tempo de decodificação. O formato multimodal já usado em `studio-chat.mjs` é um precedente de implementação local; não é evidência de aceitação real do novo payload no modelo do planejador. Usar contratos/documentação suportados, sem confundir Agents API gerenciada com Agents SDK ou transpor automaticamente outro endpoint. Não executar um probe pago para resolver isso sem autorização.

O conjunto de entrada é transmitido ao planejador e novamente em cada uma das três chamadas de imagem; não existe deduplicação de cobrança comprovada. Também há upload navegador-servidor no planejamento e na execução e, se solicitada, na reposição. Cópias e base64 ampliam memória transitória; evitar converter três vezes ou manter três versões serializadas desnecessárias. Streams/compartilhamento de buffers precisam de testes de imutabilidade e limites, não de suposições sobre memória constante.

Exibir preparação/upload, planejamento e progresso individual das imagens com estados honestos. Não prometer que a prévia já foi analisada porque o upload terminou. Registrar somente uso que o fornecedor de fato informou; ausência continua desconhecida. Não estimar preço total, desconto, aumento de qualidade ou redução de latência a partir de fixtures. Anexos podem acrescentar tempo e custo; o intervalo de produto continua inalterado.

## 8. Banco, compatibilidade e ativação

Os digests atuais podem incorporar a versão e o manifesto sem armazenar binários no SQL. Antes de optar por nenhuma migration, provar com testes que os replays com mesmo ID e outro manifesto conflitam em todas as RPCs e que o protocolo antigo não admite um payload visual ignorado. Se for necessário identificar protocolo/manifesto no registro, usar migration aditiva com valores históricos desconhecidos/legados, sem preencher hashes fictícios. Não modificar hashes de migrations aplicadas.

Planos e journals textuais existentes continuam recuperáveis no formato antigo. Novos pedidos visuais exigem suporte explícito nas duas pontas; incompatibilidade falha antes do efeito, sem fallback silencioso para texto. Tipos, schemas runtime, exports e `.d.ts` evoluem juntos. Não acrescentar código de servidor ou criptografia secreta ao bundle do navegador.

A flag existente não comprova suporte multimodal. Proposta de ativação: capacidade versionada verificada pelo cliente e servidor, com rollout separado dentro do fluxo paralelo. A recuperação de recibos, arquivos/resultados e tombstones continua disponível com novas admissões desabilitadas. Rollback operacional bloqueia novos efeitos visuais e conserva snapshots/provas e leitores; não converte operação visual para textual nem remove o armazenamento necessário à recuperação.

## 9. Plano incremental e evidências exigidas

1. Revisar a proposta completa à luz das decisões já recebidas: uploads selecionados para o pedido, cópia otimizada aceita e “terra” como arte. Não perguntar novamente. Documentar a decisão aceita em ADR e atualizar o mapa atual somente quando houver implementação aprovada.
2. Implementar primeiro o contrato puro de manifesto, política de transporte e prova com fixtures PNG/JPEG sintéticas; demonstrar rejeição antes de qualquer efeito. Sem novos serviços remotos.
3. Implementar resolução comum da seleção local e snapshot com migração conservadora; adaptar chat e arte individual preservando seus recibos, e depois planner, intent/resume, execução e reposição de ponta a ponta, mantendo a extensão visual paralela desativada até integração.
4. Integrar interface de seleção/transporte e progresso; comprovar isolamento, recuperação e limites com os testes abaixo. Se entrar dependência ou código novo no cliente, medir `next analyze` antes/depois conforme ADR 0033, sem aumentar orçamento para acomodar a mudança.
5. Executar gates aplicáveis e revisão independente. Validação visual real, caso autorizada separadamente, deve registrar os arquivos e opção escolhidos, uso observado, respostas e avaliação humana; não substituir a evidência de isolamento por uma imagem bonita.

| Grupo | Casos mínimos |
| --- | --- |
| Conteúdo e formato | PNG real com alpha, JPEG existente, orientação, limites de dimensões/pixels; base64 truncado/não canônico, MIME falso, assinatura insuficiente, 0/1/20/21 referências, soma no limite e acima. Validação completa de decodificação deve usar recurso limitado e ficar no servidor se necessária, não introduzir decoder pesado no cliente sem medição. |
| Provas | Alterar um byte, ordem, ID, papel, MIME, representação, contexto ou credencial invalida a cadeia. IDs duplicados recusados; conteúdo idêntico sob IDs distintos deve ter regra explícita sem deduplicação silenciosa. Hash informado sem os bytes correspondentes nunca autoriza submit/execute/replace. |
| Integração do fornecedor | Um turno recebe entradas multimodais na ordem correta; três prompts divergentes recebem o mesmo conjunto. Em arte individual, `referenceIds: []`, subconjunto ou ordem diferente não omitem imagens selecionadas: falham antes do efeito/prova. Verificar `/edits` e multipart real contra fetch simulado, não apenas contagem de chamadas. Nenhuma chamada sem imagens por omissão de argumento. |
| Recuperação | Respostas perdidas no planner/reserva/filhos, resultados 3–1–2, sucesso + recusa + unknown; nenhum reenvio. Reload/evicção/quota/CAS de journal, restauração exata, reposição isolada e continuidade de `replacesImageId`/revision. |
| Autoridade e origem | Duas abas, conta/projeto/post alheios, pausa durante preparo/plan/store.plan, mudança de fonte/chave, revogação antes/depois de admissão, tombstone legado sem epoch conhecido, exclusão em corrida e gate de duas rodadas. Em chat, arte e lote, excluir uploads não selecionados, legado sem ingestão comprovada e fontes externas/geradas mesmo com blob local; preservar `source`, a base de edição separada e o snapshot do pedido. Testar reanexação explícita, migração sem backfill e cliente antigo. Não adquirir epoch atual para renovar uma intenção antiga. |
| Interface e desempenho | Seleção visível e origem/cópia identificáveis; espera de 15 segundos com relógio virtual, pergunta pendente, ausência de geração por abrir/recarregar, estado por filho, crescimento de armazenamento e bundle dentro dos gates existentes. |

Ampliar as suítes existentes [artwork-input](../../packages/agents-api/test/artwork-input.test.mjs), [exploration-planner](../../packages/agents-api/test/exploration-planner.test.mjs), [studio-artwork-input](../../apps/web/test/studio-artwork-input.test.mjs), [batch-route](../../apps/web/test/exploration-batch-route.test.mjs), [journal](../../apps/web/test/parallel-exploration-journal.test.mjs) e [reposição](../../apps/web/test/parallel-exploration-replacement-journal.test.mjs), com fixtures novas nos limites que elas ainda não cobrem. Os testes existentes consultados demonstram contratos textuais/de arte separados; não comprovam a integração proposta.

## 10. Relação com decisões anteriores e limite desta entrega

Esta proposta estende o [desenho de lotes paralelos](2026-11-17-exploracao-paralela-com-planejamento-do-agente.md), que excluiu expressamente bytes de referências do primeiro planejador. Se aprovada, substituirá essa restrição no novo protocolo e limitará as referências visuais anexas de chat/arte à seleção de uploads definida nesta conversa. Preserva os [ADRs 0038](../adr/0038-chave-padrao-openai-no-vault.md), [0046](../adr/0046-contexto-e-referencias-por-post.md), [0061](../adr/0061-lotes-paralelos-e-recibos-de-planejamento.md), [0063](../adr/0063-epoch-original-da-revogacao.md) e [0064](../adr/0064-retomada-paralela-vinculada-a-intencao.md) quanto a identidade, alcance por conversa, credenciais, recibos e revogação. Não reescreve a atribuição de fontes em versões históricas nem o histórico de seleção anterior.

Entrega documental baseada em leitura do código, contratos e testes; nenhuma implementação, fixture nova, chamada paga, benchmark ou validação visual foi executada para esta proposta. Fica registrada a supersessão das dúvidas iniciais: “terra” é geração de arte, apenas uploads do computador selecionados para o pedido entram e cópia otimizada foi aceita. As perguntas de produto estão respondidas; revisão do desenho, formato técnico final e verificação dos limites externos precedem a implementação e ativação.
