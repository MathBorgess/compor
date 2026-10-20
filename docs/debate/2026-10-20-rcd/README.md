# Debate RCD, objeções e desenho do serviço

20/10/2026 · Pacote documental privado. O debate inicial dos três agentes terminou; a investigação adicional de variações de usuário/material foi solicitada depois pelo autor. Nenhum agente representa comprador entrevistado ou aprovação humana de preço, nicho ou produto.

**Resultado inicial:** P1 preciso como hipótese, deck + LinkedIn primeiro, Instagram no produto completo, contratos de confiança e plano de descoberta/uso/venda. **Não vender agora:** nenhuma prova de vantagem, instalação, dados, capacidade ou margem. O novo pedido transforma P1 em controle, sem fechar público definitivo. A investigação documental adicional terminou; descoberta real não foi executada.

## Como o debate aconteceu

| Etapa | Autor e evidência | Relação causal |
| --- | --- | --- |
| Briefing e baseline | [Briefing congelado](brief.md), [baseline/hashes](baseline.json) | Invariantes do autor e execução apenas documental |
| Perfil e oferta inicial | RCD: [P1](rcd/01-perfil.md), [proposta](rcd/01-proposta.md) | Perfil salvo antes de iniciar a persona; R$790/três formatos eram hipóteses |
| Fronteira técnica prévia | Engenharia: [memo](engenharia/00-fronteiras.md) | Responsabilidades antes da mediação, sem decidir pelo usuário |
| Objeções iniciais | Persona P1: [objeções](usuario/01-objecoes.md) | Assumiu o perfil; ainda não tinha lido oferta/preço completos |
| Mediação | Engenharia: [primeira mediação](engenharia/01-mediacao.md) | Respondeu às dez objeções e contestou ambos |
| Réplicas | [RCD02](rcd/02-replica.md), [usuário02](usuario/02-replica.md) | Usuário leu oferta inicial/mediação; RCD recebeu também sua réplica. Usuário ainda não avaliara RCD02 |
| Consolidação técnica | [Engenharia02](engenharia/02-desenho-consolidado.md) | Oferta/contratos, marcos e custo após as duas réplicas |
| Auditoria e contestação finais | [RCD03](rcd/03-auditoria-final.md), [usuário03](usuario/03-contestacao-final.md) | Ambos leram termos revisados e consolidação; detectaram escopo/copy/dados/custos. Usuário manteve recusa sintética de compra |
| Fechamento | [Engenharia03](engenharia/03-fechamento.md) | Resolveu divergências e registrou riscos, sem forçar validação comercial |
| Consolidação pelo orquestrador | [Verificação anterior à edição](verificacao-pre-consolidacao.json), [rastreabilidade](rastreabilidade.md) | As cinco docs canônicas ficaram intactas até o fechamento; 36 histórias preservadas, 14 propostas acrescentadas |
| Novo pedido de variação | [Proposta](../../servico/variacoes-escopo.md), [prompt11](prompts/11-variacoes-dna-rcd.md) | Autor pediu outro agente para variar usuário, oferta vendida e material comercial; não houve escolha de um novo ICP |
| Investigação adicional | Quarto agente: [análise](variacoes/01-dna-usuario-e-trabalho.md), [JSON](variacoes/01-matriz.json) | Quatro hipóteses, fotografia comercial e cerâmica recomendadas para descoberta; P1 controle. Sem transportar preço/esforço nem somar MVPs |
| Conferência das docs | [RCD04](rcd/04-revisao-documental.md), [Engenharia04](engenharia/04-revisao-documental.md) | Corrigidos rótulos P1 como controle e aceite M2 abrangendo toda a cadeia; correção textual não é teste de produto |
| Conferência das variações | [Variações02](variacoes/02-revisao-consolidacao.md) | Sem achados materiais; critérios próprios por episódio, sem custos herdados ou obrigação artificial de duas peças |

As rodadas brutas ficam preservadas, inclusive recomendações depois corrigidas. Links locais nelas podem apontar aos documentos atuais; a referência histórica imutável é a [baseline `9c8bfed`](https://github.com/MathBorgess/oficina-em-prancha/tree/9c8bfedd780d613519accdb93c0752e5234a687e). Não interpretar uma hipótese de rodada anterior como recomendação vigente.

## Onde ler o resultado

- [Spec e aceites](../../specs/experiencia-desktop-oficina.md).
- [Oferta/economia P1](../../servico/oferta-e-economia.md), [GTM e validação](../../servico/gtm-e-validacao.md), [marcos](../../servico/plano-implementacao.md).
- [Variações de usuário e material](../../servico/variacoes-escopo.md).
- [Fontes públicas e limites](evidencias-orquestrador.md), [cenários e fórmulas](economia-cenarios.json).
- [Auditoria do objetivo](auditoria-do-objetivo.md), [manifesto da execução](execucao.json), [ambiente observado](ambiente.json).
- [Entrega GitHub conferida](entrega-github.json): PR privada #4 aberta e issue #2 atualizada; não houve merge ou implementação.

## Limites da evidência

Há pesquisa documental e reações sintéticas. Não houve implementação, teste com modelo real, instalador, entrevista, contato, campanha, oferta, pagamento ou resultado comercial nesta rodada. Fontes oficiais de concorrentes mostram recursos anunciados; não são comparação prática. Comunidades mostram locais potenciais, sem acesso ou elegibilidade de membros comprovados.

R$601 de caixa marginal hipotético exclui trabalho/aquisição/fixos. R$690 é estímulo, sem preço aceito. A faixa técnica condicional piora o saldo de dez entregas para −R$269 a −R$785/unidade, antes de custos pendentes; não representa prejuízo incorrido. Cada hora/despesa deve ser alocada uma vez. Nenhum benefício de carreira/consultoria, receita ou baixa objeção foi observado.

TAAFT teve bloqueio anterior e não foi acessado por outro mecanismo. Tasks/fichas não verificadas continuam assim; links de features fornecidos anteriormente não substituem tasks. A skill Arena não foi utilizada. O repositório público preserva o experimento anterior; conteúdo privado desta rodada não foi copiado para lá.

## Método, fonte e termos

**Revenue-Centric Design, Richard (@richardrx)**, [revisão fixada `1942760c2242f609bf63ce2c97204f5a1791bd68`](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68). Os prompts exigiram recarregar a skill e três referências em cada avaliação; os agentes declararam fazê-lo. O registro não inspeciona cada leitura interna nem comprova comportamento universal de clientes/modelos.

Os cinco arquivos locais foram conferidos byte a byte com a fonte fixada: [hashes](fontes-rcd.json). O snapshot local não é checkout Git. [Termos integrais](RCD-LICENSE.txt) acompanham a adaptação, com atribuição e exclusão de apostas/cassinos/jogos de azar. Licença do código futuro não foi escolhida. O método não garante retorno financeiro.
