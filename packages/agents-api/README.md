# Recorte do adaptador Agents API

`createAgentHandler` aceita uma função de autenticação obrigatória e expõe um handler HTTP POST. Não está registrado como rota Next.js e não está pronto para publicação. A autenticação real, autorização de projeto, CSRF/origem, limites de uso e vinculação da sessão à conta ainda precisam ser implementados antes da exposição.

A chave da pessoa é recebida no corpo, mantida em memória durante a requisição e enviada exclusivamente no cabeçalho de autorização à OpenAI; não é escrita em arquivo nem incluída no prompt. O handler não registra prompts, resposta, cabeçalhos ou exceções. O chamador deve evitar logs de corpo/cabeçalhos e manter a chave fora de persistência, inclusive no navegador. A ausência de logs neste módulo não garante a configuração de toda a infraestrutura.

Uma chamada por turno usa Agents API com `environment=none`; ela não configura ferramentas, MCP, imagens, execução em segundo plano, recuperação de desconexões, persistência ou continuação. Ela espera o stream até um turno completo e limita o tamanho da resposta. Se houver desconexão ou timeout, uma sessão pode continuar no provedor: não repetir automaticamente sem reconciliação. O `sessionId` é provisório e não representa autorização de acesso. Uso aparece como `null` quando não medido; custos e latência ainda não estão instrumentados.

`npm test` executa testes determinísticos no handler, com provedor simulado. Isso não prova Google OAuth, Supabase/RLS, MCP, imagem, Codex, privacidade dos componentes externos ou a integração real deste handler.
