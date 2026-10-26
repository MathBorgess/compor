---
status: accepted
---

# Três perfis de acesso para testes do Compor

Em 26/10/2026, Matheus definiu, após esclarecimento no chat, três modos para testar: chave OpenAI de teste ou da disciplina, BYOK pessoal do usuário e proxy Codex. Os dois primeiros são perfis de origem da credencial/custeio sobre o mesmo adaptador da API oficial; não exigem dois provedores ou implementações da geração. O setup assistido já decidido continua disponível. Uma chave autorizada do contexto da disciplina pode alimentar o primeiro perfil, sem ser embutida ou compartilhada no produto.

O terceiro perfil chama o proxy local de laboratório. O código inspecionado do graph-engineering-lab expõe Responses em `http://127.0.0.1:8000/v1`, com texto/tools/streaming cobertos por cinco testes offline que passaram nesta rodada. Não há rota Images API implementada nem geração de bitmap comprovada. As capacidades devem aparecer explicitamente; não enviar chave BYOK real ao proxy nem trocar automaticamente para um perfil cobrado. O Compor não precisa ler a credencial Codex utilizada pelo processo de proxy.

O pedido torna o proxy selecionável nos testes internos e preserva a condição de distribuição do [ADR 0002](0002-organizacao-e-fluxo-individual.md): Codex nativo com texto e imagem, sem BYOK adicional, depende de G0 e comprovação própria. O proxy não substitui essa prova. A arquitetura de memória, organização, compositor e GitHub permanece.

## Contexto acadêmico e evidência

O anúncio Classroom de 13/10, “Lançamento do Projeto Ferramenta”, permite modelo local, API configurada pelo grupo ou BYOK e exige instruções no produto. O [notebook oficial da disciplina](https://github.com/filipecalegario/criacomp/blob/main/primeiros-passos/Primeiros_passos_com_a_API_da_OpenAI.ipynb) ensina recuperar uma chave já cadastrada no Colab Secrets com o nome `OPENAI_KEY`; não fornece uma chave nem confirma créditos, modelos habilitados ou cotas atuais.

Não foi encontrada uma credencial utilizável no processo ou nos arquivos de configuração previstos do clone acadêmico, verificados apenas por presença. Nenhuma chamada real de IA foi executada. Os cinco testes do proxy são contratos com upstream simulado; não são teste do produto, de cobrança ou de imagem real.
