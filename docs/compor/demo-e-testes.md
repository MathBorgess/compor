# Compor: demonstração e plano de testes

Data: 20/10/2026. Esta entrega descreve a demonstração e os testes futuros. Implementação, protótipo, recrutamento e cobrança exigem etapas próprias.

## O que precisamos provar

Compor propõe ajudar o dono de um curso digital a preparar e atualizar uma divulgação, preservando imagens e escolhas aprovadas. O resultado inicial reúne uma arte estática e texto de apoio. O teste compara esse trabalho com ChatGPT e Canva, incluindo os modelos que a pessoa já usa.

macOS com Electron e servidor Oracle, com um núcleo e um gigabyte de memória, são direções do autor. O servidor trata metadados técnicos de compatibilidade e disponibilidade. Pode receber diagnóstico autorizado, sem conteúdo ou credenciais. Conteúdo, imagens, credenciais, login, modelos e composição visual ficam fora dele. A geração autorizada parte do ambiente local. Abrir, editar e exportar trabalho existente funciona sem rede.

Integração, capacidade, qualidade, recuperação, demanda e pagamento permanecem pendentes. A descrição deste roteiro dispensa construir um executável nesta tarefa.

## Duas demonstrações, com provas diferentes

**Demonstração de conceito, antes de G0.** Usar dados fictícios, resultados preparados e o selo permanente “Conceito — telas e resultados preparados”. Identificar cada transição simulada. O painel de conexão explica que o acesso ChatGPT/Codex depende de confirmação. Essa apresentação testa entendimento e interesse; sua narrativa dispensa chamadas reais e dados pessoais.

**Demonstração técnica, após a integração.** G0 exige confirmar acesso autorizado e condições comerciais, além de concluir uma chamada sintética pela rota permitida. Depois, verificar persistência, composição e integração. Só então mostrar essas ações ao vivo e registrar o que ocorreu. Etapas preparadas continuam identificadas. Um corte no vídeo deve explicar a espera omitida.

Uma chamada bem-sucedida prova aquela chamada. A recuperação exige reabertura real. O arquivo exportado exige inspeção fora do aplicativo. A instalação exige pacote distribuível testado; a versão do desenvolvedor oferece evidência mais restrita.

## Roteiro de entrada no mercado: cinco minutos

Ana vende o curso fictício Organize Sua Semana. A primeira versão anuncia R$ 97. Depois, Ana muda o preço para R$ 127. Esses valores pertencem ao curso; o preço do Compor continua em estudo.

| Tempo | Duração | Tela e ação | Evidência procurada |
| --- | ---: | --- | --- |
| 0:00–0:30 | 30 segundos | **Meus projetos:** explicar tarefa e abrir o exemplo de Ana. | Público, ocasião e limite da promessa. |
| 0:30–1:20 | 50 segundos | **Base da oferta:** conferir produto, público, preço, data e endereço de compra. | Separação entre fato confirmado, lacuna e omissão escolhida. |
| 1:20–2:20 | 60 segundos | **Narrativa e visual:** combinar texto, imagem autorizada, formas e cores; conferir envio. | Prévia junto da narrativa e decisão humana sobre sugestões. |
| 2:20–3:20 | 60 segundos | **Revisão e exportação:** mudar o preço, comparar e aprovar ajustes seletivos. | Atualização na arte e no texto; frase editada preservada e versão anterior disponível. |
| 3:20–4:20 | 60 segundos | **Meus projetos:** salvar, fechar, mover a imagem original e reabrir. | Cópia interna recupera imagem, decisões e versão aprovada. |
| 4:20–5:00 | 40 segundos | **Revisão e exportação:** exportar, abrir arte e texto e apresentar a próxima ação. | Arquivos conferidos; conceito pede pesquisa; demo comercial mostra preço e condições do piloto pago. |

Total: 300 segundos. A demonstração contém quatro telas; painéis agrupam tarefas sem exigir novas telas.

Após os requisitos comerciais, a chamada final apresenta preço, escopo, suporte e condições da condição gratuita ou paga atribuída na v0. O plano comercial propõe o valor para avaliação. Antes do acesso oficial, a chamada oferece somente pesquisa de conceito e aceitação declarada de preço.

A arte proposta usa Portable Network Graphics (PNG), com 1080 × 1350 pixels. O texto usa arquivo simples (TXT), com Unicode Transformation Format (UTF-8). Na demo de conceito, indicar formatos propostos. Na demo técnica, abrir os arquivos e conferir conteúdo, dimensões, fontes, recorte e endereço de compra.

## Painéis e decisões visíveis

O painel de envio mostra tarefa, fornecedor, textos, imagens, autorização e custo ou limite conhecido. Explica “limite desconhecido” quando faltar informação. Conteúdo marcado como somente local permanece fora do envio. A autorização para gerar difere da aprovação para divulgar. Uma nova tarefa ou fornecedor exige nova conferência.

Testar também um texto com processamento externo bloqueado e divulgação aprovada. A pessoa pode inseri-lo manualmente na saída. A chamada externa continua sem esse texto. O caso inverso permite processamento autorizado, mantendo o conteúdo fora do arquivo público.

O painel de exportação mostra destino, formato, versão aprovada e limites de edição. A arte e o texto levam apenas conteúdo aprovado para divulgação. A cópia privada do projeto inclui base, imagens, versões e decisões. Credenciais ficam separadas dos projetos, cópias e registros.

Registros técnicos guardam códigos de estado, versões e duração, sem conteúdo ou segredos. Atendimento exige seleção e autorização próprias. Antes de dados reais, fechar retenção, exclusão e acesso do suporte. O projeto privado precisa de aviso antes de compartilhar.

## Uma fronteira principal e verificações separadas

A fronteira principal percorre projeto novo → edição visual → sugestão controlada → mudança → aprovação → exportação → fechamento → reabertura → restauração. Usar um fornecedor simulado para repetir respostas e falhas. Verificar os arquivos finais e a cópia restaurada em outra pasta. Mover os originais antes da reabertura comprova o uso das cópias internas.

A integração real constitui uma verificação separada: acesso autorizado, resposta válida, revogação, limite, cancelamento e proteção dos segredos. A capacidade Oracle exige outro ensaio, com concorrência, memória, disco, erros e retomada. Simulação de modelo e ensaio de servidor oferecem evidências distintas da tarefa completa.

| Falha futura a provocar | Comportamento exigido |
| --- | --- |
| Rede ou geração falha | Preservar edição; explicar tentativa, uso e decisão antes de repetir. |
| Permissão revogada ou limite atingido | Bloquear nova chamada e manter acesso local ao trabalho. |
| Pessoa cancela | Interromper quando possível; preservar versão anterior e esclarecer o estado da tentativa. |
| Disco cheio ou queda durante gravação | Preservar versão íntegra anterior; explicar salvamento pendente ao retomar. |
| Pacote ou imagem corrompida | Mostrar o problema; preservar original e permitir restauração por cópia íntegra. |
| Exportação falha | Manter projeto e arquivo anterior; permitir nova tentativa local. |
| Backend indisponível | Usar última configuração válida e manter edição, recuperação e exportação locais. |

## Cinco sessões qualitativas independentes

Recrutar futuramente cinco donos solos de curso já vendido. Exigir Mac e campanha ou atualização prevista em até 14 dias. Pedir exemplos autorizados de duas mudanças recentes de preço, data ou condição. A pesquisa exige consentimento e regra de descarte próprios.

Cada pessoa executa a mesma tarefa nos dois caminhos, com os mesmos fatos, imagens e mudança de preço. O caminho habitual usa ChatGPT e Canva. Alternar a ordem: três começam nele; duas começam pelo Compor. Registrar a ordem e o efeito de aprendizado. Esse grupo pequeno exige análise individual, sem conclusão estatística para o mercado.

Separar apresentação guiada de tentativa independente. Durante esta tentativa, observar sem orientar cada passo. Registrar pedidos de ajuda e intervenções. Contar instalação, preparo, espera, revisão, ajuda, exportação e recuperação no tempo total. Modelos, atalhos e familiaridade pertencem à comparação.

Alvos exploratórios: quatro de cinco concluem sem orientação por passo; redução mediana de 30% no tempo completo. Procurar zero fatos falsos e zero perdas nos casos observados. Esses alvos orientam revisão; eles dispensam garantia geral de segurança ou desempenho.

## Retorno e decisão

Quando houver nova ocasião, acompanhar em sete a 14 dias. Registrar reutilização, tarefa, ajuda e custo. Sem nova ocasião observável, marcar repetição como desconhecida.

Matheus definiu v0 com oferta gratuita e paga. O [protocolo A/B](experimento-v0.md) registra condição, preço, urgência e resultados por braço. A comparação de esforço com ChatGPT e Canva mede outra pergunta. Manter os registros separados.

A pré-venda pode anteceder a estabilidade, com acesso oficial, entregável, prazo e condições explícitos. Um beta disponível exige verificações técnicas para uso real. Na mesma rodada, os dois braços usam o mesmo modo de entrega. Cinco testes gratuitos deixam de ser condição para cobrar.

As cinco sessões qualitativas podem incluir compradores que aceitem participar da pesquisa. Separar consentimento de pesquisa e contratação. A compra garante a entrega contratada, mesmo quando a pessoa recusar participar do estudo. Registrar resultados de uso e de pagamento em campos distintos.

**Rejeitar a hipótese atual** se o caminho habitual oferecer esforço equivalente ou menor após contar todo o trabalho. Rejeitar também uma oferta cujo custo completo superar o benefício e a disposição a pagar observados.

**Revisar** se faltarem autonomia, correção ou recuperação. Uma perda silenciosa ou fato falso bloqueia avanço até correção e nova conferência.

**Avançar para oferta limitada** após acesso oficial, com preço e condições claros. Pré-venda explicita construção pendente; beta exige verificações de uso real. Medir aceitação e custo desde a primeira compra. Os alvos exploratórios orientam melhoria; ganhos, margem e demanda exigem evidência própria.

Registrar por sessão: código anônimo, consentimento, perfil, ocasião, prazo, ambiente, versões, ordem, tempos, ajuda, erros, arquivos, recuperação e motivo de saída. Acrescentar custo, próxima ocasião, oferta apresentada, pagamento confirmado e devolução quando aplicáveis. Todos os resultados atuais constam como pendentes. Uma peça concluída difere de receita adicional do curso.

## Método e fontes

Revenue-Centric Design, de Richard ([@richardrx](https://x.com/richardrx)), orienta a ligação entre prova, valor e cobrança. Preservar os [termos próprios](../debate/2026-10-20-rcd/RCD-LICENSE.txt), inclusive a exclusão de apostas, cassinos e jogos de azar.

Escopo: [fonte da designer](../revisao/2026-10-20-compor/fontes/adaptacao-designer.txt), [produto](../revisao/2026-10-20-compor/agentes/02-produto.md) e [engenharia](../revisao/2026-10-20-compor/agentes/03-engenharia.md). Este plano preserva a distinção entre proposta, demonstração preparada e evidência executada.
