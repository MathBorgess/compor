# Correções após a avaliação local — 15/11/2026

Implementação local na branch `feat/frontend-usability`, registrada nos commits `13cb455` e `927a599`, com decisões no [ADR 0046](../adr/0046-contexto-e-referencias-por-post.md). Não houve push, PR, deploy, uso de credenciais reais, geração paga ou aplicação de migration remota.

## Comportamento verificado

- Digitação incremental, espaço no fim da palavra, acentos e edição no meio preservam o público. A resolução semântica de conflitos continua separada do texto em edição.
- Consulta de disponibilidade da IA ignora respostas de efeito desmontado, conta anterior ou conexão encerrada. StrictMode e respostas atrasadas não produzem AbortError nem autorizam geração por disponibilidade.
- Preparação contém duas perguntas gerais. Objetivo, mensagem e ação opcional pertencem ao post. Foram exercitados posts de live, venda e autoridade, alternância e reload. O pedido inicial pode preencher a mensagem sem outra entrevista.
- Referências compartilhadas, locais e exclusões resolvem uma seleção efetiva deduplicada. Reativar uma referência herdada não cria associação local implícita. Compartilhar é explícito, e remover uma associação conserva outros vínculos, critérios e snapshots.
- Contexto enviado ao chat e transporte usa apenas as referências efetivas. Comentário local não entra na prontidão de outro post nem nas preferências gerais. Primeira aprovação usa fontes congeladas, sem atribuição retroativa de versões históricas.
- Um painel reúne busca, envio e propostas; Materiais e versões encaminha para ele. O alcance é visível. A revisão em desktop e celular verificou ausência de corte horizontal, rolagem única no conteúdo e retorno sempre disponível.
- Migração de schemas 1/2 e IndexedDB 4 conserva originais, blobs e revisão esperada. Quota aborta a transação, inclusive o arquivo do original; arquivo de schema 1 não é substituído pelo de schema 2.
- Marcadores globais de seleção anteriores mantêm suas chaves. Novas tentativas locais são separadas por post; resposta incerta conserva o UUID.

Os testes usam componentes e redutores reais com serviços simulados. A revisão visual usa contexto isolado de navegador e intercepta todas as APIs; não limpa nem substitui projetos da pessoa na revisão local.

## Evidências e limites

| Verificação | Evidência local |
| --- | --- |
| Lint e tipos estritos | Aprovados, sem avisos ou supressões |
| Build de produção | Aprovado em cópia isolada |
| Avaliador `quality:test` | 23/23 aprovados |
| Agents API | 188/188 aprovados |
| Agile Deliberation | 29/29 aprovados |
| Contexto, seleção e prontidão focados | 13/13 aprovados na rodada final |
| Regressões de edição, exportação, seleção e prontidão | 4/4 aprovadas após ajustar os percursos para o painel único |
| Fluxo integrado isolado | Espaços, três posts, referências gerais/locais, payload e reload aprovados; nenhum erro ou rejeição não tratada |
| Disponibilidade e migração de schema 2 | Aprovadas em Chromium real |
| Next local | `get_compilation_issues` retornou lista vazia; erros de navegador foram verificados diretamente com Playwright |

Uma execução ampla intermediária exerceu 410 testes: 408 passaram; duas expectativas antigas de texto/alcance foram corrigidas e aprovadas nos testes focados. A última rodada ampla e a correção final de seletor estão registradas no fechamento abaixo. Não se declara o agregado Quality gate aprovado por inferência.

`quality:unit` continua interrompendo em `private-images`: 32 aprovados, 11 falhas e 3 skips existentes relacionados aos helpers de shell/psql no Windows. Os pacotes afetados foram executados separadamente. A execução não comprova CI Linux ou isolamento entre contas reais. O teste SQL [post_reference_scope_rollback.sql](../../supabase/tests/post_reference_scope_rollback.sql) está preparado para banco vazio e isolado, com trava explícita; não foi executado, pois psql não está disponível e o Docker local está parado. A migration 00029 precisa ser validada/aplicada no ambiente apropriado antes de publicação.

`next-dev-loop` não foi declarado concluído: `agent-browser` global não está instalado, e instalar globalmente exige decisão do proprietário. Foram usados Playwright, o diagnóstico do Next e build isolado.

## Registro de bundle já realizado

A análise seguiu a skill `next-bundle-optimizer` e o [guia oficial](https://nextjs.org/docs/app/guides/package-bundling). Não foram acrescentadas dependências. O escopo foi todo o grafo client/server das 35 rotas, com foco de otimização nos imports de validação e nas definições de ferramentas compartilhadas. Não se propôs corte assíncrono ou mudança de autoridade; a análise direta dos importadores basta para esses alvos conhecidos, portanto comunidade/min-cut não acrescentaria descoberta de alvos neste recorte.

Capturas locais separadas: `feedback-before-861f170`, `feedback-after-initial` e `feedback-final-299990`. A última captura antecede a consolidação final dos controles e uploads, sem novos imports ou dependências; isso limita a equivalência exata com o build entregue. As exportações comprimidas e os logs permanecem privados.

Os snapshots mostram 202 módulos de cliente antes e 193 na última captura, 26 outputs com cobertura exata, 6 classificados como `not_a_chunk`, 43 grupos associados e nenhum membro ausente. A atribuição por fonte conta cada par output/fonte uma vez; não equivale ao gzip efetivo dos chunks nem à latência de geração. O build posterior mediu 299.917 bytes gzip de JavaScript total, com orçamento de 300.000 preservado. Lighthouse e investigação adicional de performance foram encerrados por orientação explícita da pessoa usuária.

O código de diagnóstico continua disponível em desenvolvimento; a produção pode eliminar esse trecho. Metadados de ferramentas exclusivos do agente são construídos por inicializador puro e desaparecem quando não importados. O schema público de imagem e seu validador mantêm os mesmos campos. Valores padrão de prontidão e validações de domínio foram exercitados; a retirada de verificações de formato redundantes mantém os schemas estritos e seus erros de contrato.

### Possíveis vazamentos de código exclusivo do servidor

Nenhum confirmado. O scan contém 23 correspondências heurísticas, suprimidas após inspeção: runtime do Next no navegador, interface/estado de credenciais sem material secreto, sessão pública, IndexedDB, acesso HTTP a imagens privadas e definições públicas de ferramentas. A aplicação não contém diretivas `use server`; a referência identificada pelo scan pertence ao transporte de Server Actions do framework e não contém uma implementação privada da aplicação. Adaptadores Supabase/Vault e chaves de assinatura não aparecem nos outputs de cliente inspecionados.

### Lacunas de evidência

Não foram medidos tráfego autenticado de produção, latência/custo de geração, migração remota, CI Linux ou qualidade criativa. O MCP não tinha sessão de navegador conectada ao consultar `get_errors`, portanto esse retorno não foi descrito como ausência de erros. A observação de erros/rejeições foi feita nos contextos reais do Playwright.

## Fechamento funcional

A última execução ampla exerceu 412 testes: 411 passaram, sem skips. A única falha foi um teste que ainda procurava “Remover referência” em Materiais e versões, controle movido ao painel único. O seletor foi atualizado para o resumo da seleção; esse mesmo caso passou isoladamente (1/1), preservando post, conversa e uma única iniciativa por escolha. Não se repetiu toda a suíte por uma alteração somente de seletor, e o resultado agregado daquela execução continua registrado como falha, sem ser apresentado como Quality gate verde.

A implementação está disponível para avaliação local. Recarregar a página carrega o novo schema e os componentes; não é necessário limpar armazenamento. Performance adicional foi encerrada por orientação explícita, sem alteração de orçamento ou exceções de qualidade.
