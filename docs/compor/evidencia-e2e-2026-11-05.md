# Evidência E2E para revisão de design e interação

Em 5 de novembro de 2026, Matheus priorizou deixar a jornada completa disponível para revisar design e interação, antes de refinar o restante do Marco 0. Esta evidência descreve o que foi observado, não uma aprovação de design ou conclusão de prontidão para produção.

## Ambiente e autorização

- Piloto: <https://compor-marco0.vercel.app>, deployment `dpl_8gGYAfamjCFvDG3yqRg2Jnku2NVN`, código `22e5400c041d6c68d6d08b2f21c7e12674a990ab`.
- Navegador integrado ao Codex Desktop no macOS; login Google já conectado. Chave informada pela pessoa, mantida na memória da aba.
- Autorização explícita para uma sessão `gpt-6.1-terra` e até uma imagem `gpt-image-2.6-flare`, aceitando o risco de ultrapassar US$ 5. Foi usada uma sessão e uma imagem; a tentativa `busy` anterior parou antes da chamada ao provedor.
- Supabase de teste: migração 00016 aplicada, 17 entradas de auditoria, TLS 1.3, COMMIT da migração e ROLLBACK da prova. Evidência privada `compor-call-ids-migration-result.TyqNLuJu`.

## Jornada observada

1. Projeto “Demo de revisão — aula de composição visual” criado pela interface.
2. Briefing e etapa “Conhecendo quem vai comprar” preenchidos com hipóteses e dados sintéticos. A chave existente permaneceu em memória ao trocar de projeto.
3. Versão 1 salva com título, preço, data e legenda. O MCP autenticado do Codex leu a mesma peça sem depender da chave web.
4. Marcação de elemento adicionada ao título e incluída no pedido do chat.
5. A sessão Terra consultou o contexto e alterou somente o título. A interface pediu confirmação antes de salvar a versão 2.
6. Preço `R$ 49,00`, data `12/11/2026` e legenda foram preservados; versão 1 permaneceu imutável. O MCP releu ambas as versões.
7. Uma proposta de imagem foi apresentada para a versão 2. A geração só começou após confirmação explícita na interface.
8. A API de imagem retornou HTTP 202, `status: accepted`, artefato vinculado e `usageRecorded: true`. A imagem-base foi recuperada e renderizada no quadro.
9. O turno terminou `completed`; seu trace continha quatro chamadas e quatro resultados concluídos: contexto, edição, salvamento e imagem. Os IDs `exec_` foram aceitos sem conversão.
10. PNG 1080 × 1350 exportado e validado: 1.471.172 bytes, SHA-256 `387f446a59148d7db94c274da68b5b54f67fb92f511855e0478fa93cb5f42849`.
11. A arte final foi enviada uma vez à versão 2: HTTP 201. “Ver imagem recuperada 2” fez GET privado HTTP 200 e a interface decodificou a imagem com 1080 × 1350 pixels.

## Correlação técnica

| Recurso | Identificador |
| --- | --- |
| Projeto | `fb453fa4-c643-4c24-bffe-b2757b4c2405` |
| Peça | `ba94b18c-1aa3-4108-9965-568748244365` |
| Pedido do chat | `d7853ea9-a320-468c-92ab-5e27de362fe5` |
| Tentativa | `b06a29ab-1836-4341-ab4f-ec833c92f347` |
| Sessão | `sess_0534752176ecd773006aeca56cbf5881999b6b888e41d24b7d` |
| Turno | `turn_0534752176ecd773006aeca57240988199a77301d176084184` |
| Imagem-base | `39c79fa4-856b-456d-bc74-7b30298a430c` |
| PNG final | `7c21b800-a787-429a-acb7-5ce6ef3d9914` |

Os eventos estruturados da Vercel mostraram o modelo Terra, chamadas recebidas/aceitas e conclusão do mesmo turno. Não foram capturados chaves, prompts, imagens ou identidade pessoal nesses eventos. O uso final da sessão veio `null`; isso não significa custo zero. `usageRecorded` confirma o registro de medição da etapa de imagem, não uma fatura conciliada.

## Correções de interação encontradas nesta prova

- A primeira versão era persistida, mas a seleção permanecia no rascunho porque a ordem das chaves JSONB alterava uma comparação por `JSON.stringify`. O patch passa a comparar os cinco campos semanticamente.
- Um envio recusado com `busy` não chegava ao provedor, mas permanecia pendente no navegador. O patch encerra somente esse pedido novo e mantém solicitações anteriores incertas.
- A imagem real foi gerada e aplicada, mas o texto final do agente ainda dizia que a proposta aguardava confirmação. O patch explicita geração/armazenamento no resultado da tool e acrescenta confirmação factual da aplicação local, sem reescrever a resposta do modelo.

Esses patches posteriores passaram em 133 testes de Agents, 119 da web e na build. Foram publicados no deployment `dpl_bTiWXMxDyVDXMtgKwkXCyXKn3N7a`, código `94d282fba39b00ee15772dd64c48e13db52dcb85`, observado em READY com alias canônico e sem erro de alias. Não houve uma segunda geração para retestar texto do modelo.

Após a publicação, a aba foi reaberta no endereço canônico sem a chave OpenAI. A versão 2 e sua imagem foram restauradas. O WebMCP nativo iniciou outro post sem chave ou chamada OpenAI; seu primeiro salvamento selecionou automaticamente a versão 1, comprovando a correção de comparação JSONB na interface real. O PNG exportado foi adicionado ao moodboard e a versão 2 original foi reaberta. A demonstração ficou aberta na revisão da arte; o código até `94d282f` teve push confirmado no GitHub pelo endereço atual do repositório.

## Limites desta evidência

A demonstração utiliza um projeto novo e preserva o projeto sintético anterior com uma solicitação ativa ainda não reconciliada. Isolamento com duas contas/JWTs reais e Storage cruzado, concorrência entre conexões independentes e paridade de telas Figma não inspecionadas continuam pendentes. A jornada observada permite revisão de design e interação; não substitui a aceitação do Marco 0 para produção.
