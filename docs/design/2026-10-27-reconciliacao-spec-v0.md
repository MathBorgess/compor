# Reconciliação preliminar: spec histórica e arquitetura web v0

**Estado em 27/10/2026:** análise de rastreabilidade, não uma nova spec aprovada. A [spec histórica de 23/10](../specs/compor-reestruturado-2026-10-23.md) classifica seus requisitos não conflitantes como **candidatos**, e a [arquitetura web v0](../arquitetura-v0.md) registra decisões individuais sem aprovar a arquitetura inteira. A análise separa decisões posteriores, candidatos ainda úteis e questões abertas; não demonstra implementação ou testes.

## Requisitos da spec que precisam ser lidos à luz de decisões posteriores

| Tema | Spec histórica | Direção web e impacto na avaliação |
|---|---|---|
| Plataforma e conexão | Desktop local, operação e edição offline; referências a Codex/proxy. | Navegador com conexão obrigatória; Next.js/Vercel e BYOK. Não avaliar offline como requisito da v0. |
| Dados e memória | Vault/local e promoção explícita de correções a memória permanente. | Supabase candidato; hipóteses reversíveis podem ser salvas proativamente por tarefa/campanha, com origem e evidência, sem sobrescrever preferências confirmadas. |
| Arquivos e recuperação | PNG + TXT, cópia privada restaurável e histórico local. | Baixar PNG e copiar legenda; não exportar memória na v0. Recuperação operacional usa dump e cópia de arquivos, sem equivaler a exportação/restauração pelo usuário; o procedimento ainda precisa ser testado. |
| Telemetria | Texto e imagens não entram em telemetria; hipóteses de expiração anteriores. | Metadados opcionais e conteúdo apenas com autorização específica; traces autorizados preservados para análise. Fontes Supabase autorizadas também podem alimentar curadoria. Fila e reenvio de traces são futuros. |
| Conclusão e janela | Ativação definida como aprovação + exportação em 14 dias. | Download não é aprovação ou conclusão; Q83 admite confirmação opcional do resultado e registra desconhecido sem evidência. Janela e cálculo final não foram fechados. |
| Formato e preço | PNG 1080 × 1350 e modelo comercial como candidatos históricos. | Não há dimensão de saída ou oferta/preço comercial aprovados apenas por aparecerem na spec antiga. |

## Candidatos compatíveis que merecem decisão e testes

As linhas seguintes são insumos da spec; não foram transformadas em requisitos aprovados apenas por esta auditoria. O identificador entre parênteses indica a seção aproximada da spec para facilitar a revisão.

| Candidato | Valor e lacuna no desenho atual | Teste proposto, ainda não executado |
|---|---|---|
| Preservar texto próprio, edição direta e reescrita como proposta (§ Solution; histórias 4, 6, 22–25) | A v0 prevê texto editável, mas ainda não especifica integralmente como preservar autoria, alternar e desfazer. | Pessoa edita manualmente, pede outra composição e recebe sugestão textual; verificar que texto permanece e que aplicação de sugestão é distinguível. |
| Intenção mutável e comparação justa (§ Solution; histórias 14–20, 28–31) | Exploração com duas direções é acordada; começar com uma composição quando não se quer explorar e explicitar diferença de argumento/composição ainda requerem reconciliação. | Comparar alternativas efetivamente exibidas em condições equivalentes; rejeitar ambas e mudar de intenção sem perder edição. Não exigir duas quando a pessoa não pediu exploração. |
| Fatos pendentes e recursos provisórios (§ histórias 8, 32, 40; Testing Decisions) | Fatos, voz e legibilidade são relevantes, mas o significado de “saída final” e eventual bloqueio por fato pendente não foram definidos. Q32 permite baixar rascunho sem aprovação. | Exercitar estados conhecido/pendente/omitido e identificar o que aparece na saída; comportamento do download aguarda Q85. |
| Cancelar, retomar e recuperar (§ histórias 35–39, 46; Testing Decisions) | S08/S18 cobrem timeout incerto e resposta tardia, mas não demonstram cancelamento, upload incompatível ou retomada. | Simular cancelamento e arquivo inválido sem apagar resultados anteriores; verificar a última versão persistida e explicitar quando a restauração falha. |
| Versões de projetos e referências (§ Implementation Decisions) | Preservar origem e versões ajuda a explicar saídas; identidade, snapshots e propagação para campanhas precisam ser definidos. | Alterar contexto após gerar e conferir que a peça anterior mantém sua origem identificável; testar arquivo importado removido da origem. |
| Pesquisa de valor com pessoas (§ Testing Decisions) | Processo habitual e resultados de não concluintes já constam da v0; benefício combinado antes da tarefa, legibilidade e tempos de preparação, aprendizagem, espera e ajuda ainda precisam de protocolo. | Antes do ensaio, pedir à pessoa qual benefício seria relevante; registrar separadamente tempo ativo, espera e decorrido, ajuda, edição autoral desejada e correção indesejada. |

## Decisões e evidências que não devem ser inventadas

- **Q85 em aberto:** se o rascunho contiver fato pendente, a proposta é avisar e permitir baixar, mas a resposta da pessoa ainda é necessária. A spec antiga tinha um gate para uma saída final; não há regra atual aprovada para esse conceito.
- **Q80–Q81 e Q84 em aberto:** transporte MCP/MCP Apps e conteúdo final das âncoras da rubrica continuam em discussão.
- Limites numéricos de duração, custo, amostra, preço e resolução não são decisões da v0 só porque aparecem em documentos históricos.
- Observar um PNG baixado não demonstra publicação, venda ou benefício. Um estudo com pessoas precisa de dados e consentimentos próprios; exemplos sintéticos e pareceres de agentes não são entrevistas nem comprovação de valor.

A [proposta de skills, tools e evals](2026-10-27-skills-tools-evals-proposta.md) e o [rascunho dos contratos](2026-10-27-contratos-skills-tools-rascunho.md) tratam os mecanismos e casos já desenhados. Esta reconciliação acrescenta lacunas para discussão, sem substituir a spec ou registrar consenso inexistente.
