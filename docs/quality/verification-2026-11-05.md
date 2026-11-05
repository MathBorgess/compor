# Verificação da entrada, arte integral e migração TypeScript

Rodada local concluída em 05/11/2026 na branch `codex/compor-design-deliberation`. Código de aplicação verificado em `66d796d844e5c5552f4b9480af7f4c198ee9d579`; as referências de tipos geradas pelo build foram registradas em `cfd69982d6c5ab0585f0d173d6f2a2ba59d6d3dc`. Alterações posteriores deste registro são documentação e trilha de execução.

Ambiente: macOS ARM64, 10 CPUs lógicas, Node 24.16.0, Python 3.12.1, Chrome 156.0.8078.80 e Lighthouse 13.6.0. Nenhum container foi necessário.

## Gates executados

| Verificação | Resultado observado |
| --- | --- |
| ESLint e TypeScript estrito | Aprovados |
| Contratos dos pacotes e servidor stdio | 392 testes aprovados, sem falhas ou testes ignorados |
| Scripts Python, incluindo bundle de deploy | 8 testes aprovados |
| Suíte web completa | 138 testes aprovados, sem falhas, cancelamentos ou testes ignorados |
| Avaliador de performance | 3 testes aprovados |
| Build Next de produção | Aprovado |
| Site Astro | Check de 17 arquivos sem erros, avisos ou hints; build aprovado |
| Bundle isolado da Vercel | Instalação offline limpa de 148 pacotes, typecheck sem `.next` prévio e build de produção aprovados |
| YAML e preparação de sandbox do CI | YAML, Bash e ShellCheck aprovados; execução Linux ainda não observada |

O bundle isolado foi gerado pelo script versionado a partir de `cfd6998`. Inclui TS/TSX, configuração TypeScript, os cinco pacotes locais, licença e proveniência do Agile Deliberation. O diretório temporário foi removido após a validação. Não houve deploy.

## Performance de produção

Cinco navegações mobile simuladas para `/`, sem sessão, com configuração pública sintética. Testes de navegador e Lighthouse rodaram em sequência. A carga média ao terminar era 3,11 / 3,81 / 3,91 em 10 CPUs lógicas. O gate aprovou todas as medidas:

| Medida | Observado | Limite |
| --- | --- | --- |
| JavaScript inicial | 222.016 bytes gzip | 250.000 |
| Todos os chunks de cliente | 261.338 bytes gzip | 300.000 |
| LCP mediano | 904,26 ms; intervalo 903,36–905,47 | 2.500 ms |
| TBT mediano | 13,5 ms; intervalo 13,5–14 | 200 ms |
| CLS mediano | 0,02521 | 0,1 |

Não se atribui um ganho de velocidade à mudança. A [coleta inicial](baseline-2026-11-05.md) falhou por erro de favicon e não é uma comparação válida de aprovação. O resultado atual verifica o orçamento local da entrada. Não mede geração, interação autenticada, INP de campo nem experiência de usuários reais. Os cinco relatórios completos ficam em `quality-results/performance`; o workflow os guarda como artefato por cinco dias.

## Regressões e revisão

A revisão encontrou que PNGs gerados entre 2 e 8 MiB não cabiam no contrato de edição. A preparação local explícita agora produz uma cópia JPEG dentro do limite, apresenta formato/dimensões/tamanho e preserva os originais. O teste usa um PNG ruidoso real, verifica o hash da origem após salvar a nova versão e descarta preparação atrasada após trocar imagem, peça, conta ou projeto.

Foram corrigidos dois ciclos de vida de imagens: referências eram recarregadas em revisões de estado sem mudança de conteúdo, e o editor revogava uma URL ainda presente no DOM. A regressão do editor falhou antes da correção e passou depois. Estado de imagem e URL agora pertencem ao mesmo Blob.

Rodadas intermediárias também tiveram timeouts. Readiness passou a limitar cada requisição; teardown fecha o navegador antes do servidor e limita o encerramento ao processo criado pelo teste. Duas regressões do helper verificam servidor sem resposta e processo que ignora SIGTERM. A causa exata de todos os timeouts históricos não foi comprovada; eles não se repetiram na rodada final de 138 testes. Nenhum limite global foi ampliado para obter aprovação.

Entrada e estúdio foram inspecionados em desktop e mobile, com dados sintéticos. Os testes verificam teclado, movimento reduzido, ausência de overflow da página, recuperação e separação entre contas. O detector Impeccable não encontrou padrões sinalizados. Isso não equivale a uma auditoria completa de acessibilidade ou paridade pixel a pixel com o Figma; o acesso de design pelo conector atingiu seu limite, e a referência visual foi consultada pelo navegador.

As revisões independentes não deixaram P1/P2 conhecidos no escopo examinado após as correções. Isso não substitui revisão de segurança ou prova remota. A complexidade é relatada como diagnóstico, conforme o [contrato dos gates](gates.md).

## Limites da entrega

Não houve chamada paga, login Google real, alteração de políticas Supabase, merge ou deploy nesta rodada. As chamadas de fornecedores nos testes são simuladas. O código original do Agile Deliberation mantém licença, commit e hashes; a adaptação não demonstra melhora criativa nem evidência de público real.

O workflow está implementado, mas a execução no GitHub Actions e a exigência de **Quality gate** na proteção da branch são verificações separadas. O [AGENTS.md](../../AGENTS.md), o [guia atual](../architecture.md) e os [ADRs](../adr/README.md) distinguem os bloqueios automáticos das regras que ainda dependem de revisão.
