---
status: accepted
date: 2026-11-10
---

# Chave padrão OpenAI no Supabase Vault

Matheus pediu em 10/11/2026 preparar uma chave OpenAI no Supabase Vault para quem não trouxer sua própria chave. Depois informou ter criado o segredo com nome `COMPOR_CIN_OPENAI`; esta é a entrada fixa escolhida para a integração, sem leitura do valor nesta preparação. As escolhas de experiência foram delegadas ao diretor de publicidade e crítico de AX. A opção padrão se chama **IA do Compor**; **Usar minha chave** permanece como alternativa.

Esta decisão substitui a exigência de BYOK para toda geração web e a restrição da chave da equipe aos testes no [ADR 0007](0007-arquitetura-web-e-byok.md). Mantém identidade, propriedade, RLS, arte integral, exploração limitada e recuperação conservadora. O MCP externo mantém seu contrato próprio de BYOK. A preparação não cadastra segredo, habilita produção ou autoriza chamadas pagas nos testes.

## Escolha e intenção

- BYOK explicitamente conectada prevalece. Presença inválida, recusa, falta de saldo, timeout ou indisponibilidade não causam fallback.
- Sem BYOK, novas ações podem usar a padrão disponível. O navegador recebe somente disponibilidade e fonte; nunca segredo, identificador Vault ou fingerprint.
- Disponibilidade da padrão, login, abertura/reabertura ou recarga não autorizam consumo por ela. Criar/enviar ideia ou mensagem ativa a padrão para esse projeto na sessão. Projeto recuperado sem essa intenção oferece **Começar a criar com IA**. A primeira conexão BYOK explícita mantém a autorização histórica para os projetos da sessão/aba; abrir outro projeto pode explorar se as demais travas permitirem. Trocar BYOK pela padrão não transfere essa autorização.
- Digitar BYOK altera só o rascunho em memória. Primeira conexão explícita pode ativar com ideia declarada e aviso de consumo. Após a primeira ativação de qualquer fonte, trocar ou substituir credencial pausa novas solicitações até começo/retomada explícitos ou nova mensagem.
- **Usar IA do Compor** substitui a remoção da chave própria quando a padrão estiver disponível. Pausar exploração e continuar sem IA permanecem válidos. Troca não apaga conversa, versões, imagens, recibos ou travas.

A UI não promete gratuidade, saldo ou uso ilimitado. A própria é cobrada pela OpenAI e permanece na memória da aba.

Na conversa, fonte/status e início/retomada ficam compactos. O formulário BYOK e seu aviso de consumo ficam na etapa de conexão, fora do fluxo vertical do chat; voltar conserva o rascunho. Em viewport baixo, detalhes visíveis usam mínimo de 260 px, limitado à altura útil; detalhes ocultos permitem os 180 px existentes. Estado, arraste, teclado, resize e ARIA compartilham os limites. Ocultar detalhes não reduz uma altura escolhida; a redução manual continua disponível.

## Segredo e privilégios

Nas operações de projeto, o servidor resolve a padrão depois de verificar origem, identidade e propriedade; operações de versão mantêm sua verificação específica. BYOK não consulta Vault. Falha de configuração/leitura impede somente a padrão.

A RPC fixa `compor_default_openai_key` lê apenas `COMPOR_CIN_OPENAI`. Não recebe nomes arbitrários nem cria/atualiza segredos. Execução restrita a `service_role`, com defesa no corpo e resolução de nomes controlada; `PUBLIC`, `anon` e `authenticated` não obtêm o valor.

`SUPABASE_SERVER_KEY`, exclusiva do servidor, é usada somente nessa leitura. Os dados continuam com token da pessoa e RLS. `COMPOR_DEFAULT_OPENAI_ENABLED=true` habilita a integração. Não há fallback para variável OpenAI pública nem texto enviado pelo modelo.

O valor do Vault é validado e usado em memória na requisição interna ao adaptador existente. Não vai a estado, tentativas, cookies, URLs, logs, resultados de ferramentas ou contexto do modelo. Erros não reproduzem respostas do Vault. `GET /api/ai/credential-status` é autenticado, sem cache, e retorna só `{defaultAvailable:boolean}`.

O status é global para a conta e pode ser consultado antes de existir projeto: exige origem e identidade, sem propriedade de um projeto inexistente. Não chama OpenAI nem autoriza geração. Toda operação que usa o fornecedor verifica a propriedade e resolve novamente a credencial; o booleano do cliente não concede autorização.

## Recuperação e limites

Novas provas assinadas vinculam fonte e credencial efetiva. Um envelope conserva as versões e os três segmentos públicos existentes, com uma assinatura do servidor e um MAC específico da prova, sem fingerprint estável ou segredo no cliente. O domínio da assinatura interna é separado do legado, impedindo remover o envelope para contornar a verificação da credencial. Substituir uma BYOK por outra ou rotacionar a padrão não valida provas novas da credencial anterior.

Provas BYOK históricas, emitidas antes dessa vinculação, mantêm o verificador legado. Aprovar uma ação histórica ainda pode emitir sua aprovação `v6` no protocolo legado, exclusivamente nesse fluxo BYOK. Não é possível inferir retroativamente qual chave originou a ação; a compatibilidade não deve ser descrita como vinculação histórica por credencial. Autenticação, propriedade, validade da prova e as verificações do fornecedor continuam obrigatórias.

O cliente conserva a fonte das pendências e inicia contexto novo para ações posteriores à troca. Consulta exige a fonte original disponível ou informa que a pendência precisa ser resolvida. Troca, rotação e falha do Vault não liberam resultado desconhecido para reenvio automático. Reconciliação local de uma reserva conserva autenticação, propriedade e prova assinada, sem chamar fornecedor.

Continuam três imagens sequenciais, pausa de 15 segundos, duas rodadas sem interação e espera pela pergunta de seleção. Não são teto financeiro. O responsável controla o projeto e o uso na OpenAI antes de ativar a padrão; esta entrega não cria planos ou promessa de custo.

## Operação e evidência

O [procedimento de configuração](../compor/chave-padrao-openai-vault.md) separa migration, segredo, credencial do servidor, habilitação e teste. Antes de substituir uma credencial, planeje resolver suas pendências. Provas novas exigem a credencial original: pertencer ao mesmo projeto OpenAI não basta. Recuperação pode ficar indisponível depois de uma rotação; isso não autoriza reenvio.

Gates verificam prioridade BYOK, indisponibilidade segura, autenticação/propriedade antes do Vault, papéis SQL, ausência de segredo no cliente, separação de provas e nenhuma geração por status/recarga. O [registro da validação](../quality/default-openai-vault-2026-11-10.md) distingue os testes aprovados, as correções e seus limites. Análise de todas as rotas e navegador simulado não substituem configuração remota e teste real autorizado.
