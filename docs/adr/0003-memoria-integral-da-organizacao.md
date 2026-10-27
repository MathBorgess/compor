---
status: accepted
---

# Memória integral em uma organização por usuário na v0

Em 26/10/2026, Matheus aprovou Q14 com o recorte de um usuário para uma organização na v0 e rejeitou em Q15 a separação da memória pessoal em outro repositório. A organização contém marcas ou clientes, produtos, campanhas, memórias pessoais, preferências, skills e os projetos editáveis completos; o envio ao seu repositório GitHub continua opcional. A divisão por escopos organiza a aplicação do contexto e não cria permissões ou interface multi-organização nesta versão.

A escolha concentra salvamento e recuperação em um único conjunto, com a consequência de que colaboradores adicionados diretamente no GitHub podem acessar todo o conteúdo sincronizado e seu histórico, inclusive a memória pessoal. Ela substitui a recomendação anterior de manter essa memória fora do repositório. Credenciais permanecem no cofre do sistema operacional; caches, logs e exportações reproduzíveis continuam excluídos, conforme os acordos anteriores.

A permissão de sincronizar com o GitHub é distinta da autorização de enviar contexto ao fornecedor de IA. A antiga descrição genérica de conteúdo “somente local” deve distinguir esses destinos: memória incluída no envio GitHub autorizado ainda pode estar proibida de entrar na chamada de IA. Sincronizar novas versões também não atualiza silenciosamente as versões fixadas por uma campanha.
