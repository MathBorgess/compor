# Arquitetura v0 — Compor

Resumo de decisões e tecnologias. O aplicativo, as integrações, os instaladores e o MLflow ainda precisam de implementação e validação.

## Diagrama editável

- [Arquitetura, entidades e aprendizado pelo uso](design/compor-arquitetura-v0.excalidraw) — um arquivo com três quadros. Baixe o arquivo e abra-o no Excalidraw para editar; imagens são apenas prévias.
- [Resumo e prévias no Confluence](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258).

## Visão geral

- Uma pessoa usa o app instalado para criar e revisar uma peça e exportar PNG e TXT. Projeto e contexto ficam no computador.
- O agente usa OpenAI; o proxy Codex é uma opção de teste local. GitHub é opcional para salvar a organização.
- A Oracle hospeda compatibilidade e MLflow. Feedback autorizado alimenta avaliações e melhoria revisada do harness.

## Tecnologias e decisões

- **Electron:** Windows/macOS; uma pessoa e uma organização do Compor na v0.
- **IA:** geração de texto e imagem desde a v0; chave de teste/da disciplina ou BYOK na API oficial; proxy Codex só em laboratório. Codex nativo depende de G0 e comprovação de texto/imagem.
- **Dados:** vault local com memória, preferências e skills; GitHub opcional inclui a memória pessoal compartilhada com colaboradores do repositório.
- **Observabilidade:** MLflow na Oracle; coleta de metadados opcional e conteúdo apenas em testes/evals autorizados. Traces avaliados ficam preservados; sem avaliação, cinco dias.
- **Aprendizado:** tarefa concluída fornece sinal positivo e não conclusão observada, negativo; motivo, reações e avaliação são evidências distintas. Sem treinamento de modelos ou promoção automática. A régua de promoção é hipótese revisável; amostra insuficiente é inconclusiva.
- **Perfil:** apagar o perfil ativo não apaga traces avaliados, datasets nem histórico/cópias do GitHub automaticamente.

## O design precisa possibilitar e incentivar

- Começar pela intenção: preservar texto próprio ou explorar duas rotas contrastantes, com escolha ou rejeição de ambas; permitir salvar e voltar. A escolha ajusta a sessão.
- Editar e desfazer diretamente; separar aplicar, aprovar e exportar. Uma correção só vira memória reutilizável com escolha explícita do escopo.
- Oferecer 👍 útil, 👏 muito útil e 👎 não ajudou para a versão avaliada; corretude e completude são opcionais, com “não sei”. O convite é discreto e dispensável.
- Ao encerrar sem concluir, oferecer ajuda e perguntar opcionalmente o que atrapalhou. Não tratar silêncio, pendência ou ausência de telemetria como falha.
- Explicar separadamente as permissões de GitHub, envio à IA, telemetria e conteúdo para avaliação; a recusa de feedback ou telemetria não bloqueia a entrega.
- Permitir consultar, corrigir e apagar o perfil, informando claramente os registros e cópias que permanecem e o estado da sincronização.
- Mostrar estados de autorização, geração, falha, cancelamento e retomada; preservar trabalho e permitir abrir, editar e exportar o salvo sem a Oracle.
- Guiar o setup com formulário que prepara instruções para o agente do usuário auxiliar na criação da chave e na configuração da cobrança; oferecer alternativa manual. A pessoa confirma conta e gastos antes de inserir a chave em campo protegido.

## ADRs

- [0001 — Contexto local e GitHub](adr/0001-contexto-local-e-colaboracao-github.md).
- [0002 — Organização e fluxo individual](adr/0002-organizacao-e-fluxo-individual.md).
- [0003 — Memória integral da organização](adr/0003-memoria-integral-da-organizacao.md).
- [0004 — Três perfis de teste](adr/0004-tres-perfis-de-teste.md).
- [0005 — MLflow e observabilidade](adr/0005-observabilidade-centralizada-mlflow.md).
- [0006 — Feedback e evolução do harness](adr/0006-feedback-e-evolucao-do-harness.md).

## Detalhes e histórico

- [Spec do produto](specs/compor-reestruturado-2026-10-23.md), [contratos históricos de arquitetura](arquitetura.md) e [proposta detalhada de aprendizado pelo uso](design/2026-10-26-aprendizado-pelo-uso-proposta.md). A proposta detalhada contém hipóteses que ainda não são decisões.
- [Captura da página anterior do Confluence, versão 11](historico/2026-10-27-confluence-arquitetura-v11.html), preservada antes da simplificação.
