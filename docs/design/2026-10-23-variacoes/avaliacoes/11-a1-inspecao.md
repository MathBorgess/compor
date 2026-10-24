# A1 — Inspeção visual do fluxo A e de dois moodboards

23/10/2026. **Perspectiva sintética de voz e autoria**, apoiada em AD06, PD01, EN01 e contrapontos PO03/PO04. O subagente abriu os oito PNGs abaixo com `view_image`; não entrevistou pessoas nem executou um protótipo. Cliques, duração, persistência, preferência humana e funcionamento não foram observados. Os prefixos SHA-256 identificam os arquivos presentes no fechamento desta inspeção.

## Arquivos realmente vistos

| Arquivo | SHA-256, prefixo |
|---|---|
| [A1 — Abrir o estúdio](../renders/A1.png) | `43a8e5957f975886` |
| [A2 — Editar no conjunto](../renders/A2.png) | `03fe3b7fca25ce8a` |
| [A3 — Comparar abordagens](../renders/A3.png) | `ad9cd25dca8922fe` |
| [A4 — Revisar a peça](../renders/A4.png) | `9f03d53959b74015` |
| [A5 — Saída e continuidade](../renders/A5.png) | `4a0fcf1ea50a911d` |
| [Estados](../renders/estados.png) | `0065414c55b4bdbb` |
| [Oficina editorial](../moodboards/01-oficina-editorial.png) | `7265f47a29d85073` |
| [Caderno de autoria](../moodboards/03-caderno-autoria.png) | `13cd80d128fe6513` |

Os outros fluxos e o moodboard 02 não foram inspecionados por A1 nesta rodada. Critérios anteriores: [02-a1-criterios.md](02-a1-criterios.md).

## Leitura do roteiro

**O fluxo representa as principais distinções necessárias à autoria.** A1 separa “Compor esta mensagem”, “Explorar abordagens” e começar sem texto. A2 coloca campo de texto, arte e legenda na mesma tela e diferencia “Mudar composição” de “Propor reescrita”. A3 mostra duas abordagens com áreas equivalentes e permite rejeitar ambas. A4 identifica um fato pendente e separa revisão de aprovação. A5 nomeia PNG/TXT e explicita que nenhuma publicação é feita.

Isso torna o desenho apto a uma próxima revisão dirigida, mas há problemas materiais de recuperação e linguagem a corrigir. Os estados declarados não validam preservação real de texto. Não há aceite humano nesta inspeção.

## Problemas materiais e ajustes propostos

| ID | Quadro e local | Observação visual | Consequência possível e ajuste |
|---|---|---|---|
| M1 | `estados.png`, cartão superior direito, “Falha ao gerar” | O texto diz que a peça anterior continua disponível, mas a única ação mostrada é “Tentar novamente”. | Pode sugerir que repetir a geração é a única forma de continuar. Acrescentar “Continuar com a peça anterior” ou “Voltar à edição”, mantendo repetir como opção. Não foi observado um bloqueio funcional; falta a saída no desenho. |
| M2 | `A3.png`, coluna direita, abaixo de “Rever intenção” | “Texto e fatos ficam” acompanha duas peças com redações diferentes da mensagem anterior. | A frase pode prometer que as palavras não mudam enquanto a exploração propõe outra mensagem. Usar “Seu texto anterior permanece salvo; os fatos da oferta são preservados”. Distinguir preservação da versão de manutenção literal do texto. |
| M3 | Conjunto `A2.png` e `estados.png` | Há “Texto manual mantido” e reescrita separada, mas nenhum estado visível distingue correção desta peça de preferência reutilizável no projeto. | A continuidade de voz permanece subespecificada. Incluir um estado contextual opcional para “Usar esta preferência neste projeto”, sem promover cada edição a regra nem exigir onboarding completo. Isso responde a AD06 e ao contraponto PO03. |

**Lacuna a resolver no protótipo:** em A4, “Confirmar com minha informação” não mostra qual confirmação será registrada. O fato “Acesso vitalício” está claramente marcado como pendência fictícia, e o rodapé explica sua introdução para o teste; não o interpreto como fato inventado do curso. Ainda assim, o próximo estado precisa tornar explícito que a pessoa está confirmando essa condição da oferta, e permitir voltar atrás. Um rótulo mais específico reduziria a ambiguidade sem exigir um formulário de auditoria.

## Autoria, manutenção e recuperação: prós e limites

- **Começo:** A1 oferece mensagem pronta e rascunho sem cadastro extenso. A distinção está representada; se as pessoas compreenderão “abordagens” precisa de teste. Público não aparece entre os campos visíveis, embora oferta e ação desejada apareçam. Confirmar no protótipo onde o contexto de público é consultado quando fizer diferença.
- **Reescrita:** o cartão inferior esquerdo de estados mostra texto atual, proposta, aplicar e manter meu texto. Essa separação é coerente com edição autoral. O botão primário destaca aplicar; investigar se isso induz aceitação, sem presumir que a indução ocorreu.
- **Manutenção literal:** A2, A4 e A5 repetem a redação “cuidar das tarefas do dia a dia”. É continuidade visual entre quadros, não prova de que uma geração preserva alterações. A cena de critérios anterior usava “cuidar das planilhas do dia a dia”; unificar a frase do roteiro de teste e do desenho antes do ensaio. A divergência é da demonstração preparada, não evidência de erro de um motor.
- **Recuperação:** os cartões de cancelamento, resposta atrasada e retomada offline explicitam o destino do trabalho. O caso de resposta tardia é especialmente relevante para autoria. A imagem não mostra a versão de origem aberta nem o resultado restaurado; verificar isso no protótipo funcional.
- **Saída:** A5 separa aprovação de exportação e identifica arquivos. A legenda final não está visível nesse quadro, apenas o nome do TXT; ela aparece em A4. Conferir no teste se a pessoa entende qual legenda acompanha a arte, sem atribuir publicação ou vendas à exportação.

## Moodboard 01 — Oficina editorial

**Prós observáveis:** contraste entre azul escuro e papel claro; palavra “compor” com presença editorial; três objetos de símbolo legíveis no tamanho apresentado. O primeiro, de folhas sobrepostas, relaciona partes de uma composição. Essa relação combina com o trabalho de juntar mensagem e visual. O conjunto usa margens, materiais impressos e tipografia como referências, sem ícones de automação mágica.

**Contras e hipóteses:** papel, livro, lápis e serifa ocupam grande parte da prancha. Essa direção pode aproximar a marca de publicação impressa e levar a um estilo único nas campanhas se for transportada integralmente para as peças. O símbolo central parece dois balões de conversa: essa leitura minha pode sugerir chat como mecanismo principal, enquanto o fluxo propõe edição direta. O terceiro símbolo reforça leitura de livro/publicação. Testar primeiro a simplificação das folhas, sem declarar um vencedor de marca.

A prancha não mostra símbolo pequeno de aplicativo, versão plana em uma cor ou aplicação da cena Excel ao shell. As texturas tornam plausível um caráter material, mas não permitem avaliar contraste de controles ou legibilidade em tamanho pequeno. Essas são próximas provas, não falhas demonstradas de uso.

## Moodboard 03 — Caderno de autoria

**Prós observáveis:** a paleta ameixa, creme e tons suaves é consistente; há uma relação clara entre dobra, marca de página e continuidade. O wordmark sem serifa contrasta com o título editorial. O conjunto pode apoiar um espaço pessoal de trabalho sem usar um assistente personificado.

**Contras e hipóteses:** o caderno e os materiais dominam a prancha; a finalidade de preparar divulgação comercial não está visualmente demonstrada. Entre os três símbolos centrais, o primeiro sugere fita ou dobra; o segundo se lê como dois parênteses separados; o terceiro, como fita ou balão. Essas leituras são do subagente, não testes de reconhecimento. Simplificar uma silhueta e avaliá-la pequena é mais útil do que assumir que o “C” é reconhecível. “Do seu jeito” funciona como direção de voz, mas não comprova preservação de autoria.

Assim como na Oficina editorial, falta aplicar a mesma campanha fictícia à interface. Sem isso, não dá para distinguir uma moldura calma de uma estética do Compor que invada a identidade visual de todos os clientes.

## Próxima validação

Corrigir M1/M2 e representar a decisão local/reutilizável de M3 antes do ensaio dirigido. Depois, usar a mesma tarefa para verificar escolha de intenção, edição, composição sem reescrita, rejeição, falha e retomada. Tratar as direções de símbolo como alternativas para reconhecimento e adequação, não preferências humanas já observadas. O próximo passo é validação humana; o material não está validado.
