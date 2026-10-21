# Compor V1: especificação para construção futura

20/10/2026. Estado: especificação proposta, sem implementação. Direções do autor e recomendações técnicas aparecem separadas. Esta spec substitui o recorte ativo da [spec anterior](experiencia-desktop-oficina.md), preservada como histórico.

## Problem Statement

O dono de um produto digital precisa preparar uma divulgação clara e revisar mudanças de preço, data ou condições. Ele reúne informações, adapta texto e composição e confere o resultado.

A hipótese é que repetir esse trabalho entre ferramentas consuma esforço relevante. O recorte inicial proposto é o dono solo de um curso já vendido, com divulgação em até 14 dias. O teste precisa comparar a tarefa com seu caminho habitual, incluindo ChatGPT e Canva.

## Solution

Aplicativo Electron para macOS. A pessoa constrói uma divulgação com texto, imagens, formas e cores no mesmo ambiente. A base interna preserva fatos, recursos e escolhas aprovadas. Uma mudança gera revisão seletiva e conserva a versão anterior.

A primeira saída proposta contém uma arte no formato de imagem (PNG) e legenda em texto simples (TXT). O projeto privado inclui recursos e versões para retomar a edição. A conexão inicial por conta ChatGPT/Codex passa por verificação oficial antes da oferta comercial.

## User Stories

1. Como dono, quero identificar meu produto para situar cada divulgação.
2. Como dono, quero informar meu público para orientar a mensagem.
3. Como dono, quero definir uma ação desejada para orientar o material.
4. Como dono, quero colar notas existentes para aproveitar meu trabalho.
5. Como dono, quero confirmar preço e condições para preservar fatos.
6. Como dono, quero identificar lacunas para completar informações essenciais.
7. Como dono, quero omitir um detalhe por escolha para controlar a divulgação.
8. Como dono, quero separar base e campanha atual para limitar mudanças.
9. Como dono, quero criar um projeto para preparar um material.
10. Como dono, quero abrir um exemplo fictício para compreender a tarefa.
11. Como dono, quero duplicar um projeto preservando o original.
12. Como dono, quero editar blocos para manter minha voz.
13. Como dono, quero reorganizar blocos para construir a narrativa.
14. Como dono, quero importar imagens autorizadas para representar meu produto.
15. Como dono, quero ver imagens enquanto escrevo para relacionar mensagem e visual.
16. Como dono, quero escolher formas para organizar a composição.
17. Como dono, quero escolher cores para expressar minha identidade.
18. Como dono, quero acompanhar a prévia para conferir o conjunto.
19. Como dono, quero editar a legenda junto da arte para manter coerência.
20. Como dono, quero conectar minha conta por uma rota oficial para autorizar geração.
21. Como dono, quero conhecer limites disponíveis para decidir quando gerar.
22. Como dono, quero revisar o conteúdo enviado para controlar processamento externo.
23. Como dono, quero manter dados somente locais fora dos envios.
24. Como dono, quero distinguir envio e divulgação para dar permissões específicas.
25. Como dono, quero pedir alternativas para explorar redação e composição.
26. Como dono, quero aceitar ou rejeitar sugestões para preservar minhas escolhas.
27. Como dono, quero editar uma sugestão antes de aprovar.
28. Como dono, quero cancelar geração preservando meu trabalho.
29. Como dono, quero decidir sobre nova tentativa após falha.
30. Como dono, quero conhecer revogação ou limite para escolher uma recuperação.
31. Como dono, quero salvar uma versão aprovada para retomar depois.
32. Como dono, quero mudar o preço e ver diferenças na arte e legenda.
33. Como dono, quero revisar cada ajuste antes de aplicar.
34. Como dono, quero preservar adaptações deliberadas para manter meu propósito.
35. Como dono, quero desfazer uma atualização para recuperar a versão anterior.
36. Como dono, quero conferir o material inteiro para encontrar impactos adicionais.
37. Como dono, quero exportar arte e legenda para encaminhar por conta própria.
38. Como dono, quero abrir o arquivo exportado para conferir legibilidade.
39. Como dono, quero reconhecer limites de edição em outros programas.
40. Como dono, quero reabrir com minhas imagens após mover os originais.
41. Como dono, quero criar uma cópia completa para recuperar o projeto.
42. Como dono, quero restaurar em outra pasta preservando a cópia original.
43. Como dono, quero entender corrupção ou imagem ausente para recuperar uma versão íntegra.
44. Como dono, quero preservar trabalho após queda ou disco cheio.
45. Como dono, quero abrir, editar e exportar trabalho salvo sem nova inferência.
46. Como dono, quero escolher dados de diagnóstico antes de pedir suporte.
47. Como dono, quero conhecer armazenamento e exclusão para controlar meus dados.
48. Como dono, quero separar cópia privada e material público para compartilhar com segurança.
49. Como dono, quero operar por teclado e compreender estados por texto.
50. Como dono, quero conhecer entrega e preço antes de contratar um serviço futuro.
51. Como operador, quero medir custos e ajuda para verificar sustentabilidade.
52. Como mantenedor, quero testar compatibilidade para distribuir sem desativar proteções do Mac.
53. Como operador, quero cobrar no braço pago desde a primeira oferta para medir aceitação e sustentabilidade.
54. Como operador, quero comparar oferta gratuita e paga na v0 para observar urgência, uso e compromisso.
55. Como operador, quero descrever pré-venda ou beta com clareza para testar compra antes da estabilidade.

## Implementation Decisions

### Direções explícitas do autor

- Electron, aplicativo baixável para macOS e conteúdo gerado dentro da ferramenta.
- Conexão inicial com conta ChatGPT/Codex, sujeita ao acesso oficial disponível.
- Backend inicial Oracle com um processador e um gigabyte (GB) de memória.
- Contexto interno e criação narrativa com imagens, formas e cores.
- Documentação no repositório privado; construção permanece fora desta execução.

O texto da designer propõe Compor e donos de produtos digitais. O recorte em curso já vendido é recomendação da revisão.

### Contratos técnicos propostos

**Projeto:** uma pessoa, produto e divulgação por projeto. Base, blocos, fatos, permissões, recursos e versões ficam locais. A skill interna contém instruções separadas dos dados. O usuário dispensa editar essas instruções.

**Visual:** edição de texto, imagem, formas e cores acontece antes de escolher a saída. Um compositor limitado atende prévia e exportação. Modelos locais evitam execução de conteúdo arbitrário.

**Geração:** o adaptador recebe versão, tarefa e contexto permitido. Retorna alternativa validada, sem sobrescrever o aprovado. Conclusão, falha, cancelamento, revogação e limite exigem estados distintos. Nova tentativa requer decisão explícita.

**Mudanças:** cada bloco conserva relações conhecidas com fatos. Mudar R$97 para R$127 apresenta diferenças e o conjunto completo. Aplicar, rejeitar e desfazer preservam adaptações e histórico. A pessoa confere impactos além dos detectados automaticamente.

**Imagens:** importar PNG ou Joint Photographic Experts Group (JPEG) incorpora bytes ao projeto. Guardar origem declarada, dimensões, autorização e resumo criptográfico. O resumo permite conferir integridade. Referências temporárias e caminhos externos deixam de ser dependências de recuperação.

**Persistência:** gravar nova versão, verificar integridade e só depois ativá-la. Falha conserva a última íntegra. Migração cria cópia; esquema futuro incompatível preserva original. 

Limites candidatos: dez imagens, dez megabytes cada e pacote de 250 megabytes compactado e extraído. Cada imagem aceita até vinte milhões de pixels e 8192 pixels por lado. Decodificar uma imagem por vez; miniaturas limitam cada lado a 2048 pixels. O pacote aceita até mil entradas. Exceder limites recusa a entrada e preserva o projeto.

**Saídas:** arte PNG de 1080 × 1350 pixels e legenda TXT em Unicode Transformation Format (UTF-8), codificação que preserva acentos. Cópia privada em pacote de arquivos (ZIP) inclui base, imagens e versões. ZIP agrupa arquivos. Exportação pública exclui contexto privado, credenciais e metadados das fotos.

**Restauração:** extrair em outra pasta, conferir manifesto e resumos e só depois abrir. Bloquear caminhos externos, links simbólicos e expansão excessiva. Cópia corrompida permanece preservada. Exclusão considera versões e exige ação explícita.

**Dados:** envio externo por tarefa difere de divulgação na saída. Conteúdo somente local permanece fora das chamadas. Credenciais ficam no armazenamento protegido local. Política de provedor, retenção, diagnóstico e exclusão antecede dados reais.

**Backend:** Oracle serve compatibilidade e recebe diagnóstico autorizado. Projetos, imagens, tokens, modelos e renderização ficam fora dele. A última configuração válida mantém o trabalho local. Logs técnicos sem conteúdo têm retenção candidata de cinco dias.

**Continuidade:** abrir, editar, exportar e restaurar material salvo independe de inferência, renovação e disponibilidade da Oracle. Geração exige rede e acesso autorizado. O aplicativo comunica essa distinção antes da tarefa.

### Condição de integração e cobrança

G0 verifica elegibilidade comercial e limites da conexão. Uso do plano ChatGPT precisa existir sem pagamento obrigatório ao app. Monetizar editor ou assistência exige confirmação de separação permitida. [Condições e fontes](../arquitetura.md).

O login antigo do Codex, credenciais de outra aplicação ou conta compartilhada ficam fora de alternativas de contorno. Interface de programação de aplicações (API) paga e abertura de código exigem nova decisão. Antes de G0, a demo identifica resultados preparados e conexão pendente.

## Testing Decisions

Uma fronteira principal observa o comportamento completo: criar base e visual, salvar, gerar, revisar preço, exportar, reabrir e restaurar. O teste verifica trabalho preservado e arquivos úteis. Ele dispensa depender da organização interna dos componentes.

O repositório contém documentação, sem testes executáveis anteriores. A implementação futura pode usar provedor simulado para falhas repetíveis. Integração real e distribuição exigem verificações separadas. A [matriz de testes](../compor/demo-e-testes.md) detalha casos e evidências.

| Fronteira | Aceite futuro |
| --- | --- |
| Base e visual | Fatos, lacunas, omissões e elementos visuais permanecem editáveis no mesmo fluxo |
| Alteração | Preço muda em arte e legenda; edição manual e versão anterior sobrevivem |
| Dados | Marcadores locais ficam fora das chamadas; divulgação segue sua permissão; diagnóstico exige autorização específica |
| Permissões independentes | Texto bloqueado para processamento pode entrar manualmente na saída quando sua divulgação tiver aprovação |
| Recursos | Mover originais preserva imagens; restauração em outra pasta mantém relações e escolhas |
| Recuperação | Queda, corrupção e disco cheio preservam original e última versão íntegra |
| Integração | Conclusão real, limite, revogação, falha e cancelamento respeitam permissões e preservação |
| Saída | PNG e TXT abrem fora do app; pacote privado restaura sem credenciais |
| Continuidade | Trabalho salvo abre, edita e exporta com rede desligada |
| Distribuição | Pacote instala na matriz macOS declarada com proteções normais |
| Oracle | Carga sintética mede memória, erros e reinício; queda preserva trabalho local |

Cinco sessões qualitativas comparam tarefas equivalentes no Compor e no caminho habitual. Alternar ordem e registrar familiaridade reduz efeitos de aprendizagem. Contar preparo, instalação, espera, revisão, ajuda e exportação.

Alvos exploratórios: quatro de cinco concluem sem orientação por etapa e mediana de 30% menos tempo. Esses números orientam revisão, sem provar prevalência ou significância. Erro factual crítico e perda silenciosa bloqueiam o piloto seguinte até correção.

Matheus definiu v0 com teste A/B de oferta gratuita e paga, incluindo possibilidade de venda antes da estabilidade. O [protocolo v0](../compor/experimento-v0.md) propõe sorteio após qualificação, mesmo escopo e registro por braço. Pouca amostra exige interpretação exploratória.

Pré-venda exige acesso oficial, entregável, prazo e condições explícitos. Beta exige também verificações técnicas para uso com dados reais. Essas ofertas podem anteceder a estabilidade geral; elas preservam os limites declarados. Cinco testes gratuitos e três compras deixam de ser pré-requisitos da comparação.

O [plano comercial](../compor/negocio-e-gtm.md) propõe o preço do braço pago e a conta de sustentabilidade. Matheus definiu testar cobrança; o valor específico permanece proposta.

Repetição exige retorno numa nova ocasião real. Demonstração, teste simulado, uso independente e venda medem resultados diferentes. Cobrar permite medir aceitação; recuperar custos depende de receita e despesas observadas.

## Out of Scope

Nesta entrega: app, protótipo executável, dependências, testes executáveis, acesso à Oracle, publicação, contato e cobrança.

Na primeira versão proposta: vídeo, carrossel, apresentações, vários adaptadores, publicação automática, anúncios, métricas de campanha, contratos e pagamentos do curso.

Sincronização, colaboração, geração de imagens, documento portátil (PDF) e edição externa por camadas ficam para outro recorte. Suporte a outros sistemas depende de decisão futura.

## Further Notes

O recorte anterior de oficinas, a proposta de fotografia e seus números permanecem históricos. Suas estimativas e preços deixam de orientar esta versão. A revisão registra [decisões, divergências e pendências](../revisao/2026-10-20-compor/README.md).

Mavi reforçará o desenho das quatro telas e painéis. Matheus conduz o desenvolvimento futuro. Integração, capacidade, distribuição e economia exigem os testes descritos, além do design.

Método: **Revenue-Centric Design, Richard (@richardrx)**, com [termos integrais](../debate/2026-10-20-rcd/RCD-LICENSE.txt). A adaptação exclui apostas, cassinos e jogos de azar. Licença do código futuro continua aberta.
