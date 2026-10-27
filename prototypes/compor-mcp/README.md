# Compor MCP — protótipo local

Protótipo para estudar o protocolo e as quatro skills do Compor antes da integração com o produto. É independente da interface visual e **não é o backend da v0**. O servidor processa as entradas recebidas em memória, mas não consulta dados armazenados, Supabase, imagens, BYOK ou APIs externas e não fornece persistência, geração, moodboard, edição ou exportação. Use apenas entradas fictícias neste protótipo.

## O que está implementado

- `list_skills`: retorna os identificadores, descrições e a versão do catálogo.
- `load_skill`: carrega instruções de uma das quatro skills locais, por identificador e versão permitidos, com SHA-256 do conteúdo para identificar o texto usado em uma avaliação. A versão é um rótulo do protótipo, não um registro imutável de conteúdo.
- `prepare_word_cloud`: prepara dados sem persistência ou renderização; preserva frequência, sugestão e escolha **informadas pelo cliente**. O peso efetivo segue essa prioridade: escolha informada, sugestão informada, frequência informada; zero é válido e ausência fica `null`. O protótipo não verifica quem forneceu cada valor. Essa regra é experimental e não confirma preferências nem estabelece que as escalas são equivalentes.
- `prepare_moodboard`: prepara uma direção versionada com elementos, referências opacas, rótulos, prioridades, pistas visuais e restrições separadas. Não busca imagens, renderiza, gera nem persiste; origem informada é alegação do cliente, não confirmação de autoria. Formas e ícones são pistas de estilo. Aspectos ou restrições omitidos retornam `null`, distintos de listas explicitamente vazias. Conflitos detectados são apenas literais: ausência de aviso não prova que o quadro está consistente.
- `stdio`: processo para um cliente MCP local que executa o servidor como subprocesso.
- `fetchInProcess`: adaptador experimental para testar MCP Streamable HTTP por `fetch` interno, sem abrir socket. Seu URL `https://compor.invalid/mcp` é um identificador de teste, não um servidor na internet.

As skills são instruções revisáveis, não funções executáveis ou autorizações. O servidor retorna apenas instruções do catálogo fixo; texto de referências futuras é dado não confiável. O MVP não implementa autorização, autenticação ou isolamento entre pessoas. **Não exponha este protótipo na rede e não o use com dados reais.**

## Preparação e testes

Requer Node.js 20 ou superior. Na pasta deste protótipo:

```sh
npm ci --ignore-scripts
npm test
```

O teste compila TypeScript e executa doze cenários automatizados:

1. Negociação MCP em memória, descoberta de tools e carregamento das quatro skills, com `fetch` global bloqueado.
2. Recusa de versões/identificadores inexistentes e argumentos inválidos, sem divulgar caminhos locais, e erro para a tool inexistente `generate_image`.
3. Negociação MCP via `stdio` com um processo filho e comparação do catálogo. O SDK herda uma lista padrão de variáveis de ambiente do processo pai; o teste não prova ambiente inteiramente vazio.
4. `MCPServerStreamableHttp` do Agents SDK negocia MCP, lista tools e chama `load_skill` pelo adaptador de `fetch` em processo, com tracing desativado e chamadas ao `fetch` global bloqueadas.
5. A preparação da nuvem preserva as fontes, a prioridade, o peso zero e os valores ausentes.
6. Entradas inválidas ou fora dos limites são recusadas pela tool de preparação.
7. O moodboard preserva direção, papéis, prioridades, restrições e origem não verificada.
8. Conflitos literais recebem avisos, sem que uma prioridade anule restrições.
9. Referências, IDs, elementos e geometria inválidos são recusados.
10. Textos maliciosos são tratados como dados na tool e nenhuma referência é buscada via `fetch` no cenário de teste.
11. Elementos com instruções literalmente opostas e pistas sem valor recebem avisos sem alterar o quadro.
12. Aspectos e restrições omitidos são distinguidos de listas explicitamente vazias.

**Resultado observado em 27/10/2026:** 12 testes passaram em Node.js v24.16.0. As verificações não exercitam uma chamada de modelo, a Vercel, o app, autenticação ou dados reais. O bloqueio de `fetch` nos testes exercitados não prova ausência geral de toda comunicação de rede ou segurança de isolamento.

## Teste nativo do Codex app-server

Em macOS ou outro sistema POSIX, com Codex CLI e Python 3 no `PATH`, execute após o build:

```sh
python3 scripts/test-codex-app-server.py
```

O script cria um diretório temporário exclusivo para o cliente Codex, sem copiar configurações ou autenticação existentes. Usa um ambiente explícito sem credenciais, um único servidor MCP `stdio` e um provedor fictício com endereço local. Envia `initialize`, consulta `mcpServerStatus/list`, cria uma thread efêmera e chama as quatro tools por `mcpServer/tool/call`; não envia `turn/start` nem solicita modelo. O JSON de saída informa os resultados e verifica o SHA-256 das instruções retornadas por `load_skill`. Ao encerrar, o script aguarda o app-server e solicita o encerramento apenas do grupo de processos que criou.

**Resultado observado em 27/10/2026:** Codex CLI `0.162.1` descobriu `list_skills`, `load_skill`, `prepare_word_cloud` e `prepare_moodboard`, listou os quatro IDs na versão `0.1.0-prototype`, confirmou o hash de uma skill, rejeitou ID inexistente e verificou quadro e pesos sintéticos. Isso verifica o cliente app-server via `stdio`, não que um modelo usou a skill, o transporte em processo do aplicativo ou isolamento de usuários reais.

## Conectar um harness local via stdio

Após `npm ci --ignore-scripts` e `npm run build`, configure o cliente MCP para iniciar o executável Node local com o caminho absoluto para `dist/stdio.js`. Exemplo de configuração genérica; os campos exatos dependem do harness:

```json
{
  "command": "node",
  "args": ["/CAMINHO/ABSOLUTO/compor/prototypes/compor-mcp/dist/stdio.js"]
}
```

A configuração não faz parte do teste automatizado e não instala nem altera um harness. O processo deve ter acesso de leitura à pasta `skills/` do mesmo protótipo. O cliente deve encerrar o subprocesso ao fechar a conexão. Nunca acrescente credenciais aos argumentos do comando ou ao retorno das tools.

## Próximas verificações, ainda não realizadas

- Testar uma sessão real com modelo e dados sintéticos quando houver autorização e orçamento; o teste do app-server acima não demonstra uso da skill pelo modelo.
- Projetar identidade, escopo, autorização por operação, proteção de BYOK, consentimento e isolamento antes de qualquer dado de usuário ou endpoint acessível.
- Validar o ciclo de vida, cancelamento, concorrência e desempenho com Next.js/Vercel e versões fixadas. `fetchInProcess` é somente para teste, não é uma decisão sobre o adaptador de produção.
- Definir e implementar as ferramentas de memória, referências, feedback e geração com seus testes; não expor operações que o protótipo não executa.
- Comparar a qualidade das trajetórias e das saídas com avaliações humanas e casos reservados; os testes atuais verificam protocolo, catálogo e preparação de dados, não valor criativo.
