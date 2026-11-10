# Fechamento do feedback do Estúdio

Registro de 10/11/2026. As issues #22–#27 e #33 foram integradas em `compor/feedback-estudio` com seus gates aprovados. As escolhas de experiência foram delegadas por Matheus ao subagente diretor de publicidade e crítico de AX. O PR final para `main` reúne a entrega; produção e teste com o modelo real continuam separados desta validação.

## Resultado para a pessoa

- A faixa de contexto mantém oferta, público, direção e fatos editáveis. Públicos antigos divergentes aguardam uma escolha; fatos distinguem confirmação, pendência e omissão.
- A ideia orienta sugestões de referências. Busca e prévias externas dependem do consentimento da sessão. Com a chave conectada, a ideia basta para o primeiro lote de três propostas, preservando os limites e a espera pela resposta no chat.
- O editor permite escolher mais referências e voltar sem perder post, imagens, versões, conversa ou rascunho do chat. Um pedido explícito de novo post abre o editor sem iniciar exploração entre ferramentas.
- O histórico considera escolhas reais da própria conta e vínculos com versões aprovadas. Recusas afetam o projeto atual; dados incompletos de aprendizagem não impedem aprovar a arte nem geram crédito inventado.
- Variantes declaradas de estilo, composição ou gancho ganham cards e começam sem aprovação. Retoques mantêm a origem; os contratos v2 continuam disponíveis.
- A revisão reúne arte, legenda e download PNG em uma ação. O caminho legado e o seletor `COMPOR_STUDIO_WEB_ENABLED` foram removidos com autorização de Matheus.

O diretor de AX escolheu a faixa no topo e aprovou as [capturas finais](feedback-estudio-2026-11-10/). Controles de variantes e o atalho de referências medem 44 px nos dois viewports. O atalho fica antes dos cards e visível após o contexto. A evidência separa jornada funcional e geometria; usa dados e serviços sintéticos.

Títulos antigos continuam disponíveis para renomeação manual. Retorno automático de foco ficou fora deste lote: Enter mantém o foco existente; uma melhoria futura precisa respeitar edição, diálogos e troca de tela.

## Evidências de qualidade

| Etapa | PR de integração | Resultado remoto |
| --- | --- | --- |
| Correções de título e pergunta de seleção | [34](https://github.com/MathBorgess/compor/pull/34), [35](https://github.com/MathBorgess/compor/pull/35) | Quality gate aprovado |
| Suíte paralela e medição inicial | [36](https://github.com/MathBorgess/compor/pull/36), [37](https://github.com/MathBorgess/compor/pull/37) | Quality gate aprovado |
| Remoção do legado | [38](https://github.com/MathBorgess/compor/pull/38) | Quality gate aprovado |
| Revisão simplificada | [39](https://github.com/MathBorgess/compor/pull/39) | Quality gate aprovado |
| Contexto e isolamento físico das fixtures | [40](https://github.com/MathBorgess/compor/pull/40) | CI 53: 303/303, Quality gate aprovado |
| Referências sugeridas e retorno ao post | [41](https://github.com/MathBorgess/compor/pull/41) | CI 54: 329/329, Quality gate aprovado |
| Variantes e integração visual | [42](https://github.com/MathBorgess/compor/pull/42) | CI 55: 336/336, Quality gate aprovado |

A validação cumulativa local passou em lint, tipos, unidades, SQL focado de referências e variantes (2/2), navegador (336/336, sem skips), build e análise de todas as rotas. A comparação do bundle está nos relatórios de [legado](legacy-removal-2026-11-09.md), [revisão](review-24-2026-11-10.md), [contexto](context-25-2026-11-10.md), [referências](references-33-2026-11-10.md) e [variantes](variants-26-2026-11-10.md). Orçamentos não mudaram.

O checkout final mediu 288.022 bytes de JavaScript gzip, com 11.978 bytes de folga até 300.000. JavaScript inicial da entrada sem sessão: zero. Cinco medições locais tiveram TBT zero; LCP mediano de 639 ms e CLS mediano de 0,008. Esses números não medem o Estúdio autenticado nem a latência ou qualidade da geração.

No CI 55, as cinco medições também tiveram TBT zero, com 288.022 bytes gzip, LCP mediano de 674 ms e CLS de 0,008. A suíte passou 336/336 em 570,12 s; a janela dos logs do job foi de 613,92 s, abaixo do teto de 20 minutos. É uma execução observada, sem promessa de duração ou de custo mensal.

O CI de referências testou a árvore `cf1b8bb8ed7b3faeac9ad95c72badf744df29edb`, idêntica à integração após seu merge. O de variantes testou `bf4b15f6bf99ef3f3e3e9c37c061d096dd72e225`, igual antes e depois do merge anterior e à integração final. Assim, a sobreposição dos dois CIs preservou a ordem de integração e o conteúdo validado.

O [registro do executor](browser-worker-isolation-2026-11-10.md) conserva as falhas investigadas, a prova adversarial entre dois servidores e a correção das esperas positivas. O CI 53 aprovou o executor isolado em 303/303 testes, com TBT zero nas cinco medições. O padrão de timeout do executor, os limites específicos dos testes e o teto de 20 minutos do job não aumentaram.

## Pacote de release sem credenciais

`scripts/stage_vercel_web.py` preparou o commit imutável `4b37e1d4f8aaff645768a23db86b9312bd671531`, com 229 fontes e dependências locais confinadas em `vendor`. Manifesto SHA-256: `ab872391390adc014f1676141783b427408bc5129178f311044e8a59c8fa6755`.

Instalação com `--ignore-scripts`, tipos e build desse pacote passaram. Todos os 229 hashes de entrada continuaram iguais depois do build. O pacote emitiu 288.036 bytes gzip, 14 bytes a mais que o checkout; são builds medidos separadamente, sem atribuição causal dessa diferença ou medição de transferência de rede. Ambos ficam dentro do orçamento.

Um smoke HTTP do build empacotado, com configuração pública sintética, confirmou entrada sem sessão 200, nenhum script externo, `no-store` e ativo da marca 200. Não houve login, chamada paga, deploy ou alteração de alias. O manifesto está em `/workspace/scratch/compor-release-4b37e1d-final/STAGE-MANIFEST.json`; os logs em `release-final-{install,types,build}.log` e os resultados em `release-final-{smoke,bundle}.json`, dentro de `/workspace/scratch`.

## Liberação em produção

O CLI deste ambiente está sem autenticação. A ferramenta conectada não oferece o deploy de produção com `--skip-domain`. Um preview com flags ou origem diferentes não comprova o mesmo artefato de produção. O merge para `main` deve permanecer pendente até haver o caminho de liberação exigido, pois ele dispara migrations.

O aplicativo valida uma única `APP_ORIGIN` nos POSTs e redirecionamentos de login. A compatibilidade do host de teste com essa origem e com o callback Google/Supabase ainda precisa ser demonstrada; esta entrega não amplia a origem para contornar o teste.

Em leitura em 10/11, `compor-marco0.vercel.app` continuava no deployment `dpl_Gn4srAdxS1YfkKa4x32tFAJA7UoP`, em estado `READY`. O deployment mais recente listado era de 07/11. Nenhum deploy ou mudança de domínio foi solicitado nesta execução.

Depois de resolver esses pré-requisitos, a sequência do handoff é:

1. Integrar o PR único para `main` com todos os jobs aprovados e confirmar o workflow de migrations para esse commit.
2. Preparar o código desse commit e criar o deployment de produção com `npx vercel --prod --skip-domain`, mantendo o domínio onde está.
3. Matheus testar os quatro cenários abaixo nesse deployment, com o modelo real.
4. Promover o mesmo deployment somente depois dos resultados aprovados.

| Cenário real | Resultado esperado |
| --- | --- |
| Seleções contraditórias | Leitura, recomendação e uma pergunta; exploração aguarda a resposta e preserva fatos |
| Insistência após contestação | Segue a preferência sem repetir a mesma contestação ou alterar os fatos |
| Mudança de estilo | Nova variante sem aprovação, com imagem anterior e histórico preservados |
| Sugestão de título | Até 48 caracteres; aceitar atualiza, recusar persiste sem repetir a proposta na próxima sessão |

As migrations aditivas de referências (`20261109000026`) e variantes (`20261109000027`) permanecem em commits próprios, por último em cada feature. Não foram aplicadas em produção por esta execução. O [handoff original](https://github.com/MathBorgess/compor/blob/93dc7d32de279f87a0c22f45e0a0627430cf4289/HANDOFF.md) preserva a autorização e a ordem; o arquivo temporário é retirado no PR final.
