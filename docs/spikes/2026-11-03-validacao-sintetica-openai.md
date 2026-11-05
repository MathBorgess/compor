# Compor — validação sintética das APIs OpenAI

Registro: 3 de novembro de 2026, 20:08 -03; chamadas executadas imediatamente antes do registro. Autorização: até US$ 5 no total. Ambiente: macOS, Python 3.12.1 e curl 8.7.1, com verificação TLS. A chave fornecida foi mantida apenas em memória e não foi registrada.

- **Agents API:** uma requisição `POST /v1/agents/sessions`, beta `agents=v1`, modelo `gpt-6-astra`, `environment.type=none` e entrada sintética curta. Resposta HTTP 201, com evento `agent.session.turn.completed`. A sessão foi excluída em seguida, com HTTP 200. O uso de tokens não constou dos eventos coletados: custo desconhecido.
- **Images API:** uma requisição `POST /v1/images/generations`, modelo `gpt-image-2.5-flare`, 1024×1024, qualidade `low`, uma imagem sintética. HTTP 200; resultado em memória com assinatura PNG válida e 729.103 bytes. Uso retornado: 16 tokens de texto de entrada e 196 tokens de imagem de saída.
- **Estimativa de imagem:** US$ 0,00596 = 16 × US$ 5 / 1 milhão + 196 × US$ 30 / 1 milhão, pela tabela pública consultada em 3 de novembro de 2026. É estimativa, não conferência de faturamento. O total efetivo das duas chamadas permanece desconhecido.

As requisições usaram curl com configuração recebida pelo stdin de um processo Python, sem persistir credencial ou imagem. Uma tentativa inicial com urllib falhou na verificação do certificado local antes da conexão; curl com verificação TLS foi usado para as chamadas efetivas. Os ensaios não demonstram integração E2E do produto, MCP, Codex, Supabase, autenticação ou custo por peça.

Fontes oficiais consultadas: [Agents API quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart), [Images API](https://developers.openai.com/api/docs/guides/image-generation) e [preços de modelos](https://developers.openai.com/api/docs/pricing).
