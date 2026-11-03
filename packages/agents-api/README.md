# Recorte do adaptador Agents API

`createAgentHandler` aceita uma função de autenticação obrigatória e expõe um handler HTTP POST. Não está registrado como rota Next.js e não está pronto para publicação. A autenticação real, autorização de projeto, CSRF/origem, limites de uso e vinculação da sessão à conta ainda precisam ser implementados antes da exposição.

A chave da pessoa é recebida no corpo, mantida em memória durante a requisição e enviada exclusivamente no cabeçalho de autorização à OpenAI; não é escrita em arquivo nem incluída no prompt. O handler não registra prompts, resposta, cabeçalhos ou exceções. O chamador deve evitar logs de corpo/cabeçalhos e manter a chave fora de persistência, inclusive no navegador. A ausência de logs neste módulo não garante a configuração de toda a infraestrutura.

Uma chamada por turno usa Agents API com `environment=none`; ela não configura ferramentas, MCP, imagens, execução em segundo plano, recuperação de desconexões, persistência ou continuação. Ela espera o stream até um turno completo e limita o tamanho da resposta. Se houver desconexão ou timeout, uma sessão pode continuar no provedor: não repetir automaticamente sem reconciliação. O `sessionId` é provisório e não representa autorização de acesso. Uso aparece como `null` quando não medido; custos e latência ainda não estão instrumentados.

Depois que uma requisição é enviada, os erros `upstream_error` e `incomplete_turn` podem representar um resultado desconhecido, com execução e cobrança no provedor, mesmo quando o cliente recebe HTTP 502. O chamador não deve tentar novamente automaticamente: antes da exposição pública é necessário implementar persistência e reconciliação que permitam recuperar e identificar a tentativa sem duplicá-la.

`npm test` executa testes determinísticos no handler, com provedor simulado. Isso não prova Google OAuth, Supabase/RLS, MCP, imagem, Codex, privacidade dos componentes externos ou a integração real deste handler.

O adaptador de rota por projeto exige verificação de origem, identidade e propriedade e aceita um registrador de tentativas confiável. Ele grava o início antes de chamar o provedor; falha na gravação final ou do provedor resulta em estado desconhecido sem retry automático. O registrador durável ainda não existe: a rota Next.js permanece fechada até sua implementação e validação, inclusive isolamento entre contas. O adaptador não recupera o resultado se uma sessão continuar após timeout.
