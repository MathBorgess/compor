# Gestão do Compor no Confluence e Jira

Em 24/10/2026, Matheus definiu o Confluence como central organizadora do Compor e o Jira como superfície de execução. A construção passa a acontecer em público e em comunidade, com pessoas selecionadas para contribuir em diferentes partes do projeto. Essa decisão não torna o repositório público nem define uma nova licença.

| Preciso de… | Onde encontrar |
|---|---|
| Contexto, documentação atual e navegação do projeto | [Confluence Compor](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/360627) |
| Entrar no projeto e entender a quem pedir ajuda | [Onboarding](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/196637) |
| Planos de teste, critérios e evidências | [Testes e evidências](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/458753) |
| Assumir tarefas, refinar backlog e acompanhar sprints | [Jira — projeto SCRUM](https://compor-mathai.atlassian.net/issues?jql=project%20%3D%20SCRUM%20ORDER%20BY%20key) |
| Consultar arquivos e versões capturadas | [Biblioteca de fontes migradas](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/491521) |

## Precedência e preservação

O [desenho de arquitetura de 26/10](https://compor-mathai.atlassian.net/wiki/spaces/COMPOR/pages/1376258) consolida as decisões fechadas no chat e seu diagrama. Matheus definiu manter as perguntas e propostas no chat e registrar no Confluence apenas as decisões fechadas. O pedido inclui dois modos de conexão à IA (OpenAI BYOK e Codex instalado) e proxy apenas para testes internos.

Nas rodadas de 26/10, Matheus definiu v0 para Windows e macOS, setup assistido pelo agente do usuário e salvamento/colaboração opcionais pelo GitHub. A aprovação de Q5–Q9 fechou conteúdo editável completo no repositório, memória por escopos e skills declarativas versionadas. Em Q10–Q13, delimitou um repositório por organização do Compor, foco no operador individual sem governança por escopos, atualização explícita das versões de contexto da campanha e geração de imagens desde a v0. O [glossário](../GLOSSARY.md) e os [ADRs](adr/0002-organizacao-e-fluxo-individual.md) incorporam apenas decisões aprovadas e preservam sua evolução.

Q14–Q17 fecharam o recorte de um usuário para uma organização na v0, toda memória no mesmo repositório opcional da organização, Codex com texto e imagem nativos sem chave BYOK complementar como condição de liberação e composição local com elementos textuais editáveis. O [ADR 0003](adr/0003-memoria-integral-da-organizacao.md) preserva a escolha de concentrar a memória. Os gates de integração, distribuição e testes continuam pendentes; arquitetura aprovada não comprova aplicativo implementado.

Na atualização posterior de 26/10, Matheus definiu três perfis de teste: chave OpenAI de teste/da disciplina, BYOK pessoal e proxy Codex local. O [ADR 0004](adr/0004-tres-perfis-de-teste.md) distingue esses perfis da distribuição: o proxy interno não comprova imagem nem substitui G0. A chave acadêmica é uma possível origem de credencial autorizada, sem concessão de crédito ou cota confirmada nas fontes consultadas.

Também determinou centralizar traces e avaliações em MLflow na Oracle, ampliando a responsabilidade anterior do backend. O [ADR 0005](adr/0005-observabilidade-centralizada-mlflow.md) registra a escolha; payload, retenção e execução de avaliações estão em fechamento no chat, sem autorizar automaticamente conteúdo ou uso de chaves do usuário para modelos avaliadores.

Atualizações compartilhadas de requisitos, onboarding, decisões e evidências de teste ficam no Confluence. Estado de trabalho, responsáveis e sprints ficam no Jira; os arquivos deste repositório não substituem esse acompanhamento.

A spec consolidada de 23/10/2026 substituiu definições anteriores sobre público, promessa, fluxo, quantidade obrigatória de rotas, ativação e monetização. Ela permanece como referência da proposta para validação, sujeita às decisões posteriores registradas no Confluence. Contratos técnicos que não foram alterados continuam referências candidatas, sem comprovar implementação ou elegibilidade da integração.

Os documentos do Drive, o pacote de design e um snapshot de `README.md` e `docs/` da cópia de trabalho local foram preservados na biblioteca. O snapshot local inclui alterações não commitadas e documentos não rastreados; não equivale ao conteúdo de um commit ou à versão atual de `main`. Os documentos antigos e a licença própria do método RCD permanecem como histórico e proveniência.

Uma captura separada preserva `README.md` e `docs/` do `main` remoto no commit `31bd9f18da43aa1ef4d37610e09b11e2da261c45`, anterior a este aviso de migração. As contagens e os manifestos das três origens ficam separados na biblioteca.

Os cenários de teste migrados continuam planos até terem execução e evidência registradas. A migração de documentação não executa testes de produto, não implementa o aplicativo e não valida demanda ou pagamento.
