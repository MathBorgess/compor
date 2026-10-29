# Phoenix: avaliação offline de ranking e cobertura

Registro de 29/10/2026. Este documento descreve o que os ensaios já permitem observar e pré-registra uma comparação futura; não executa novas buscas nem chamadas pagas. A unidade de avaliação é uma pessoa e um briefing. Os quatro briefings são fictícios; os candidatos vieram de fontes curadas reais. As notas são de designers simulados, não de clientes. O ranking observado é o resultado do fluxo completo, inclusive pós-processamento; ele não isola o efeito do Decision API.

## O que os registros mostram

Notas do designer: 0 incompatível; 1 utilidade limitada; 2 atributo parcialmente útil; 3 muito útil. Um 2 não é aprovação nem direção integral. P@3 usa o limiar ≥2, divide sempre por três e descreve apenas concordância com esse parecer. NDCG@3 usa ganho `2^nota − 1`, desconto `log2(posição + 1)` e ideal das nove notas disponíveis; é relativo ao conjunto recuperado.

| Caso e fonte | Pontuados / solicitados | Ranking, três primeiros | Notas desses três | NDCG@3 | P@3 ≥2 | Candidatos ≥2 / 9 |
|---|---:|---|---|---:|---:|---:|
| Finanças: [dados](decision-mcp-evidence.json), [parecer](designer-decision-cego.md) | 9/9 | 06, 05, 08 | 2, 2, 0 | 0,765 | 2/3 | 3 |
| Botânica: [dados](botanica-decision-evidence.json), [parecer](designer-botanica-cego.md) | 9/9 | 01, 07, 02 | 2, 2, 1 | 1,000 | 2/3 | 2 |
| Reuniões: [dados](reunioes-decision-evidence.json), [parecer](designer-reunioes-cego.md) | 9/9 | 05, 01, 03 | 2, 1, 2 | 0,803 | 2/3 | 3 |
| Marina, antes: [dados](marina-decision-evidence.json), [parecer](designer-marina-cego.md) | 9/9 | 05, 06, 03 | 1, 0, 1 | 0,363 | 0/3 | 1 |
| Marina, após SID: [dados](marina-after-sid-evidence.json), [parecer](designer-marina-pos-sid-cego.md) | 9/9 | 09, 08, 07 | 1, 1, 1 | 1,000 | 0/3 | 0 |

O último conjunto ilustra o limite: **NDCG perfeito com nenhuma referência parcialmente útil**. Ele ordena bem em relação ao melhor disponível segundo esse parecer, mas não atinge o objetivo de encontrar referências úteis. Nenhum dos cinco conjuntos recebeu nota 3. Os registros declaram nove candidatos pontuados; a resposta de cada descoberta contém seis resultados, dos quais foram analisados os três primeiros. A avaliação visual cobre as nove miniaturas; hashes em pareceres identificam o material, mas arquivos temporários podem desaparecer. Preserve os bytes autorizados ou registre expressamente a perda: hash sozinho não recria a imagem.

As duas rodadas de Marina usaram conjuntos de imagens e roteamento diferentes; seus números não são um teste pareado da mudança de SID. Nos ensaios de finanças e da primeira rodada de Marina, o designer já tivera contato anterior com parte do contexto ou propusera uma direção, reduzindo a independência. Miniaturas pequenas limitam julgamento de detalhe, autoria e direitos. Não é possível inferir escolha da pessoa pelo parecer: em Marina antes da correção, ela aproveitou atributos de 05 e 03 apesar de receberem nota 1, e rejeitou 06. Nos demais casos, verificar as falas em [finanças](persona-interacoes.md), [botânica](botanica-persona.md) e [reuniões](terceira-persona-interacoes.md). Em finanças uma imagem rejeitada reapareceu, mas não há prova de que a rejeição anterior estivesse registrada e disponível ao motor.

## Reproduzir os cinco cálculos sem rede

A partir deste diretório, com Node.js instalado:

```sh
node - <<'NODE'
const fs = require('node:fs');
const casos = [
  ['Finanças', 'decision-mcp-evidence.json', '48e49c75', [1,0,0,2,2,2,0,0,0]],
  ['Botânica', 'botanica-decision-evidence.json', '1ca465a3', [2,1,0,0,1,1,2,0,0]],
  ['Reuniões', 'reunioes-decision-evidence.json', '90200bb6', [1,0,2,1,2,2,0,0,0]],
  ['Marina', 'marina-decision-evidence.json', '9daabb5f', [1,0,1,2,1,0,1,0,0]],
  ['Marina após SID', 'marina-after-sid-evidence.json', '354d3f33', [1,1,1,0,0,1,1,1,1]],
];
const dcg = notas => notas.slice(0, 3).reduce(
  (soma, nota, i) => soma + (2 ** nota - 1) / Math.log2(i + 2), 0);
for (const [nome, arquivo, prefixo, notas] of casos) {
  const doc = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const ranking = doc.ranking || doc.data.candidates;
  const resultados = doc.decision_results || doc.data.decision_score_batch.candidates;
  const ids = notas.map((_, i) => `phx_${prefixo}_${String(i + 1).padStart(2, '0')}`);
  if (resultados.length !== 9 || new Set(resultados.map(x => x.candidate_id)).size !== 9 ||
      !resultados.every(x => ids.includes(x.candidate_id) && x.status === 'scored'))
    throw new Error(`${arquivo}: candidatos pontuados não correspondem ao parecer`);
  const top = ranking.slice(0, 3).map(x => ids.indexOf(x.candidate_id));
  if (top.length !== 3 || top.includes(-1) || new Set(top).size !== 3)
    throw new Error(`${arquivo}: top 3 inválido ou sem parecer`);
  const notasTop = top.map(i => notas[i]);
  const ideal = dcg([...notas].sort((a, b) => b - a));
  console.log(JSON.stringify({
    caso: nome, pontuados: resultados.length, retornados: ranking.length,
    top: top.map(i => ids[i]), notas: notasTop,
    candidatos_parciais: notas.filter(x => x >= 2).length,
    precisao3: notasTop.filter(x => x >= 2).length / 3,
    ndcg3: ideal ? dcg(notasTop) / ideal : null,
  }));
}
NODE
```

As notas no comando são transcrição dos pareceres ligados acima; conferir IDs, hashes e parecer original é parte da auditoria. `null` significa NDCG indefinido por ideal zero, não resultado perfeito. O código falha se houver IDs ausentes, duplicados ou não pontuados; não transforma erro ou ausência de julgamento em nota 0. A contagem 9/9 aqui reproduz os resultados de pontuação registrados, não verifica novamente os serviços externos nem identifica candidatos que o provedor possa ter omitido.

## Comparação controlada proposta

1. **Congelar casos e condições antes das respostas.** Usar pelo menos seis novos briefings sintéticos, separados por pessoa e campanha dos casos acima e de qualquer ajuste de pesos. Salvar briefing, critérios privados e objeções com data e hash antes de gerar respostas. Esses seis casos são exploratórios, não amostra que permita concluir eficácia comercial. Uma opção é contrabalançar a ordem dos dois fluxos na mesma persona, registrando efeito de aprendizado; outra é usar pessoas separadas, com menor comparabilidade. O julgamento da experiência e o julgamento das referências são tarefas distintas.
2. **Montar um conjunto comum elegível para isolar o ranker.** Em cada briefing, registrar IDs, origem e identidade/hash da imagem, atributos observados, política de busca e exclusões, versão de perfil e autorização. Fixar antes da comparação critérios de elegibilidade, rejeições registradas no contexto correto e desempate determinístico. Rodar offline o controle e o candidato sobre os mesmos itens e informações disponíveis. A ordem original registrada só é baseline se o mesmo conjunto e as mesmas regras forem reconstruíveis. Caso uma condição altere a busca, avaliar recuperação separadamente; não atribuir a diferença ao ranking. Nenhum pedido cria autorização para nova fonte.
3. **Avaliar às cegas antes de abrir rankings.** Reunir a união dos candidatos elegíveis de ambos os braços, inclusive os não expostos, embaralhar com semente registrada, remover nome do braço e scores; apresentar imagem, briefing e apenas contexto permitido. No mínimo dois avaliadores humanos independentes, sem autoria do método nem exposição a decisões anteriores, devem pontuar 0–3 e explicar atributos e ressalvas; registrar discordâncias e acordar previamente sua resolução sem apagar notas individuais. A independência e a disponibilidade do material devem ser verificáveis. Sem avaliação humana ou com imagens perdidas, o resultado continua preliminar ou não reproduzível.
4. **Cobertura e integridade antes da relevância.** Para cada braço informar recuperados únicos, duplicados, elegíveis, filtrados e motivo, submetidos, pontuados, abstidos, falhas, retornados e apresentados; cruzar os IDs entre etapas. Cobertura de pontuação = pontuados únicos / recuperados únicos; reportar também pontuados / submetidos quando houver filtros autorizados antes do modelo. O denominador e o estágio devem ficar explícitos. Meta experimental: todo candidato recuperado tem score ou abstenção/falha explícita; score ausente e fallback não são sucesso. Não contaminar um perfil com eventos de outra pessoa nem transformar referência sintética em real.
5. **Relatar qualidade da busca e da ordem juntas.** Apresentar, por caso, distribuição de notas e contagem de itens ≥2 e =3 no conjunto comum; P@3 fixo, NDCG@3 e quantos itens foram realmente apresentados. Se houver menos de três, os lugares vazios contribuem zero ao P@3. Se IDCG for zero, NDCG é indefinido. Informar também recall@3 = itens ≥2 no top 3 / itens ≥2 no conjunto avaliado; com denominador zero, é indefinido. Esse recall vale somente para a união julgada, não para toda a internet. Um item sem julgamento, com imagem indisponível ou identidade não verificável torna a métrica correspondente inconclusiva, não nota zero. Não alegar sucesso da busca apenas por NDCG ou cobertura altos; conjuntos sem nota ≥2 são explicitamente classificados como sem referência parcialmente útil, com opção de continuar sem referência.
6. **Comparar por pares e preservar resultados.** Publicar os rankings completos e a diferença por caso entre controle e candidato, junto das contagens absolutas, abstenções e falhas. Registrar versões de código, modelo efetivo, prompts, parâmetros e origem. Não recalibrar pesos nesses casos e depois tratá-los como teste reservado. Separar resultados de ordenação de roteamento, atribuição de SID, diversidade, aplicação de notas negativas e rejeição; cada variação precisa de controle próprio, mesma entrada e tratamento rastreável. Se faltarem entradas, permissões, scores ou o conjunto comum, marcar a comparação inconclusiva.

## Experiência e resultados criativos

O objetivo pedido para designer e engenheiro é uma experiência que possa encantar, motivar e surpreender uma pessoa exigente, deixando-a com vontade de compartilhar e confiança percebida no potencial do post. Para não trocar o objetivo por uma nota de ranking, perguntar primeiro em aberto e registrar a fala literal, a versão e o contexto; depois, se a pessoa quiser, perguntar separadamente sobre satisfação, encantamento, surpresa agradável, motivação, vontade de compartilhar, confiança na visibilidade e em ajudar a vender, com motivos e ressalvas. Registrar ausência de evidência como não demonstrada; não inferir aprovação de silêncio, download ou abertura da imagem. A interpretação do agente fica separada da fala. A opção de rejeitar tudo, seguir sem referência ou parar permanece disponível.

Em [Marina](persona-cativante-interacoes.md), uma versão motivou a persona simulada e deu vontade de compartilhar, mas ela não declarou encantamento profundo; estimou visibilidade em 4/5 e auxílio à venda em 2/5 como impressões próprias, não observações de público ou vendas. Avaliação da peça, edição pela pessoa, fluidez da conversa e aderência às decisões são medidas separadas; nenhuma garante efeito de mercado. Avaliação do sistema tem consentimento separado da personalização; dados agregados, telemetria e perfis não se confundem. Antes de promoção, pedir avaliação humana independente e específica; publicação e aferição real de alcance/vendas exigem decisões e autorizações próprias.

## Latência, custo e motor

Registrar modelo efetivo e todas as etapas, chamadas, tokens de entrada/saída, leituras e escritas de cache, falhas e tempo de ponta a ponta. Diferenciar o score Decision, calculado a partir das probabilidades de níveis, de logprobs de tokens; um logaritmo dessas probabilidades não é evidência de token logprobs. Para afirmar ganho de velocidade ou custo, comparar condições pareadas com mesmo conjunto, modelo, paralelismo e configuração; registrar ordem e aquecimento de cache e repetir o suficiente para mostrar a distribuição. Os poucos ensaios disponíveis e cache não observado como leitura não demonstram ganho nem P95 confiável. Custos devem usar consumo medido e preço válido da execução, com etapas ausentes marcadas como desconhecidas.

## Controle descritivo adicional sobre os mesmos conjuntos

O [replay offline](../../../prototypes/compor-mcp/scripts/evals/replay-ranking-control.mjs) ordena os nove scores Decision registrados, compara o top 3 ao resultado entregue e calcula a expectativa de uma ordem aleatória uniforme pelas 504 sequências distintas de três itens. Cada linha usa as mesmas notas de designer simulado descritas acima; não cria julgamentos novos nem reconstrói resultados que não foram preservados. Para reproduzir: `node scripts/evals/replay-ranking-control.mjs` a partir de `prototypes/compor-mcp`.

| Caso | P@3 entregue | P@3 esperado por ordem aleatória | NDCG@3 entregue | NDCG@3 esperado por ordem aleatória |
|---|---:|---:|---:|---:|
| Finanças | 0,667 | 0,333 | 0,765 | 0,370 |
| Botânica | 0,667 | 0,222 | 1,000 | 0,395 |
| Reuniões | 0,667 | 0,333 | 0,803 | 0,407 |
| Marina, antes | 0,000 | 0,111 | 0,363 | 0,401 |
| Marina, após SID | 0,000 | 0,000 | 1,000 | 0,778 |

Nesses cinco registros, os três primeiros na ordem entregue coincidem com os três maiores scores Decision, inclusive sua ordem; isto não demonstra que os demais estágios não tenham efeito em outros dados. O controle aleatório é uma referência matemática fraca, não representa o comportamento anterior do produto. Os dois casos de Marina não são pareados entre si: no primeiro, a única referência com nota ≥2 ficou fora do top 3; no segundo não havia nenhuma. Esta análise exploratória reutiliza casos e notas já vistos, algumas avaliações não são independentes e faltam amostra e julgadores humanos para concluir superioridade ou promover parâmetros. Nenhuma diferença aqui comprova encantamento, conversão ou velocidade.

### Disponibilidade dos pixels — verificação posterior

Na verificação local de 29/10/2026, os caminhos registrados para os quatro conjuntos de botânica, reuniões e Marina existiam (9/9 em cada conjunto). No registro de finanças, os nove candidatos têm hashes e `bytes_preserved_temporarily: true`, mas não há caminhos para os bytes. Uma busca por esses hashes nos diretórios temporários `compor-decision-mcp-*` não encontrou correspondência. A marca original descreve a captura no momento do ensaio; a disponibilidade atual das nove miniaturas de finanças **não foi comprovada**. Não se deve alegar que sua avaliação visual pode ser reproduzida apenas a partir dos hashes. Os demais arquivos continuam temporários e sua existência nesta verificação não assegura retenção futura.
