# Decisões e origem

## Revisão Compor após conversa com a designer

Fonte: mensagem de Matheus e texto da designer anexado em 20/10/2026. A [revisão](revisao/2026-10-20-compor/README.md) preserva a fonte e os quatro pareceres.

| Origem | Direção ou proposta | Efeito atual |
| --- | --- | --- |
| Autor | Electron para macOS | Define o primeiro sistema; distribuição e compatibilidade exigem teste |
| Autor | Conta ChatGPT/Codex inicialmente | Preservar direção; elegibilidade e cobrança permitida exigem confirmação oficial |
| Autor | Oracle com um processador e 1 GB de memória | Backend inicial; capacidade permanece sem medição |
| Texto da designer | Nome Compor e donos de produtos digitais | Substitui foco ativo em oficinas e caso-guia de fotografia |
| Revisão de produto | Dono solo de curso já vendido; divulgação em 14 dias | Recorte para pesquisa; demanda permanece hipótese |
| Consolidação | Uma arte PNG 1080 × 1350, legenda TXT e cópia ZIP | Contratos propostos para testar; PDF e outros adaptadores ficam posteriores |
| Consolidação | Imagens incorporadas; projeto local versionado e recuperável | Testar após mover originais, desligar rede e restaurar cópia |
| Consolidação | Oracle sem conteúdo, tokens, inferência e renderização | Compatibilidade e diagnóstico autorizado; registros técnicos candidatos por cinco dias |
| Fonte oficial | Uso do plano ChatGPT sem pagamento obrigatório ao app | Confirmar separação comercial antes de oferecer editor ou assistência |
| Autor | Reforçar specs, negócio, mercado e testes | Esta execução mantém apenas documentação; Mavi reforçará design |
| Autor, resposta ao painel | Manter privado e validar acesso oficial antes de vender | Confirmar elegibilidade e condições de cobrança antes da oferta; G0 continua pendente |

As propostas fecham um caminho para revisão e construção futura. Elas preservam a autoridade do autor e exigem as provas descritas na [spec atual](specs/compor-macos-v1.md).

## Registro histórico anterior

O restante deste documento preserva decisões e propostas anteriores à adaptação Compor. Em conflitos de recorte, seguir a revisão acima e a spec atual.

Fonte das decisões: instruções e respostas explícitas de Matheus na conversa Codex de 19–20/10/2026. Recomendações do agente são identificadas como propostas.

| Data | Decisão | Consequência |
| --- | --- | --- |
| 19/10 | Explorar três ideias por caixa morfológica, sorteio, três agentes Luna e crítico orientado a Revenue-Centric Design | Preservar o processo no repositório acadêmico; seleção dos agentes é hipótese para validação |
| 19/10 | Preparar pitch de até cinco minutos | Documento acadêmico separado da implementação |
| 20/10 | Guardar contexto narrativo e visual numa skill interna por oficina | Reutilizar a mesma base entre formatos |
| 20/10 | Mostrar imagens, formas e cores durante a construção da narrativa | Apoio visual faz parte da criação, além da saída final |
| 20/10 | Cada formato usa prompt + skill; exemplos: pitch deck, LinkedIn e Instagram | Adaptadores trabalham sobre a mesma oficina |
| 20/10 | “Conteúdo gerado na ferramenta” | Geração no aplicativo confirmada; revisão/edição internas são requisitos derivados propostos, sem nova confirmação explícita |
| 20/10 | Aplicativo Electron, baixável e usado internamente, como referência de experiência ao Perssua | Plataforma desktop confirmada; não se presume a arquitetura ou as funcionalidades do produto citado |
| 20/10 | Repositório privado para construir o app, com mini documentação | Este repositório concentra a construção; o fork público preserva o processo acadêmico |
| 20/10 | “Não implemente”, apenas specs no repositório privado, usando `to-spec` | Esta execução fica restrita à síntese documental; sem código, dependências ou instaladores |
| 20/10 | Criar três agentes para debater RCD, objeções do usuário e mediação de engenharia, com GTM e planos de implementação/vendas | Investigação e ajuste documental autorizados; não autoriza execução desses planos ou promessa de retorno |
| 20/10 | Investigar perfis além de facilitadores, que vendam produtos/serviços, e outros materiais de venda; criar novo agente RCD | P1 vira controle de comparação; público/material prioritários continuam abertos. Não autoriza atender todos os perfis nem trocar o nicho silenciosamente |

## Evolução do escopo

Oficina em Prancha foi selecionada originalmente como roteiro curto + prancha PNG. O autor mudou a entrega para contexto narrativo/visual reutilizável e múltiplas saídas. Isso altera o caminho sorteado; não é uma nova seleção dos agentes. O [experimento original](https://github.com/MathBorgess/projeto-ferramenta-criacomp/tree/f7d3ef162595d01fd8ec685422e6d264cc658282/docs/experimentos/2026-10-19-sorteio-rcd) continua preservado.

Preço, custos e esforço anteriores não foram transferidos para este app. A hipótese comercial deve ser reavaliada com geração por formato, imagens, revisões e suporte. Não houve teste com compradores ou receita observada.

A orientação comercial da exploração veio de [Revenue-Centric Design, Richard (@richardrx)](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68); o material e seus termos específicos permanecem no experimento de origem. Nenhuma licença do código deste novo app foi escolhida nesta etapa.

## Escolhas ainda abertas

- Sistemas operacionais e distribuição dos instaladores.
- Fornecedor/modelo de IA, configuração de acesso e dependência de rede.
- Formatos técnicos e acabamento das exportações.
- Persistência definitiva, sincronização e geração de imagens.
- Capacidade/divisão do grupo, esforço e preço.

React/TypeScript, templates, contexto versionado e persistência local são propostas iniciais. A definição do produto não demonstra implementação ou viabilidade comercial.

## Recomendações do debate, sem aprovação humana

Os três agentes foram reutilizados nas réplicas e auditorias: RCD propôs P1 antes de a persona assumir o perfil; ela contestou oferta/alternativas, e engenharia mediou. P1 é uma microconsultoria de uma a três pessoas que vende oficina B2B de feedback para líderes a RH/T&D nos próximos 30 dias. Persona, reações e recomendações não são entrevistas, prova social ou decisão de compra.

A inicial tinha três formatos e R$790. A réplica cortou para deck + um social e usou R$690 como estímulo experimental. A auditoria final corrigiu a ordem para **deck + LinkedIn primeiro**, preservando Instagram posterior. A livre escolha inicial foi retirada porque antecipava um adaptador ainda não construído. A preferência de LinkedIn não foi observada no mercado.

Contrato proposto: base aprovada e lacunas, permissões distintas para envio à IA/divulgação, revisão seletiva de mudanças, adaptações preservadas, arquivos recuperáveis, acesso a trabalho existente após o serviço e correção de defeito separada de ajuste. O fluxo de dados cobre narrativa/deck/social/atendimento/registros, não só o post. Esses comportamentos ainda precisam de implementação/testes; termos não comprovam menor objeção.

**Parecer comum: não vender agora.** Produto, instalação, dados, capacidade, teto de valor e margem não estão demonstrados. R$690 não é preço aprovado. O cenário de 80h era financeiro; a estimativa técnica condicional posterior de 98–184h de entrada piora o saldo modelado para −R$269 a −R$785 por entrega com dez entregas, antes de custos não cotados. As faixas precisam de reestimativa, especialmente com aceites adicionais. Alocar horas/despesas uma única vez; não duplicar avaliação/recrutamento entre desenvolvimento, entrega e aquisição.

Depois do fechamento dos três agentes, Matheus pediu [variações de DNA do usuário e trabalho comercial](servico/variacoes-escopo.md). O quarto agente investiga combinações com produto/serviço fora de oficinas. P1 fica preservado como controle histórico; nenhuma recomendação nova substitui uma decisão do dono. A generalização para “contexto de oferta” é proposta a investigar.

O quarto agente concluiu pesquisa documental de quatro hipóteses: branding B2B, fotografia de alimentos, cerâmica para lojistas e templates Notion. Recomenda V2 fotografia primeiro e V3 cerâmica como contraste, sem atender ambas automaticamente ou presumir compra. A proposta de descoberta de uma variação deve substituir o plano P1, sem somar contatos/custos silenciosamente. Material deve seguir a tarefa comercial; não forçar posts nem duas peças onde uma basta. Sem transferência de preço/esforço P1.

Registro completo, fontes, termos e rastreabilidade: [debate de 20/10](debate/2026-10-20-rcd/README.md). As cinco mini docs permaneceram idênticas à baseline durante o debate inicial; foram consolidadas somente após o fechamento do engenheiro. Rodadas brutas e a baseline estão preservadas.

O material RCD fixado foi conferido contra a fonte e seus termos integrais acompanham o debate. A adaptação atribui **Richard (@richardrx)** e mantém [licença própria completa](debate/2026-10-20-rcd/RCD-LICENSE.txt), sem aplicar a apostas/cassinos/jogos de azar. Não atribuir MIT ao código futuro ou garantir retorno financeiro.
