# Triagem de referências e divergência antes do GPT Image

A pergunta do ensaio é se o agente entende o que aproveitar de cada referência selecionada e oferece três caminhos que preservam a direção do criador e representam escolhas visualmente diferentes. A bancada usa cinco briefings sintéticos, três de desenvolvimento e dois de reserva. A reserva abre para a comparação final. O planejador publicado é o controle. As cinco revisões experimentais usam apenas o parecer da rodada anterior nos casos de desenvolvimento.

## Duas comparações pareadas

1. **Seleção e intenção.** Para cada briefing, duas sessões independentes do Agents API recebem o mesmo texto. O braço completo inclui de duas a seis referências. No outro braço, uma referência externa ou gerada é retirada. O juiz tem acesso às imagens, aos critérios por referência, às decisões e aos prompts. Ele indica separadamente se o agente entendeu a característica, atribuiu a intenção à imagem certa e a usou onde o criador pediu. IDs e transporte são conferidos deterministicamente. A baseline expõe a seleção e os prompts. Sua intenção só pode ser pontuada quando esses dados fornecem evidência.
2. **Efeito do arquivo na arte.** O plano admitido do braço completo fornece os mesmos três prompts, na mesma ordem, para as duas séries de imagens. O experimento remove só os bytes da opcional selecionada. Confere os hashes dos prompts, arquivos enviados e configurações. Se a triagem omite a opcional, os braços passam a ser idênticos e o par fica sem intervenção. O mesmo resultado criativo pode variar entre duas chamadas ao provedor. As diferenças observadas incluem essa variabilidade.

Antes da geração, um crítico sem ferramentas recebe o briefing e três prompts. Para cada par, compara o mecanismo de contraste e a estrutura visível, cita trechos dos prompts e descreve a escolha que a pessoa poderá fazer. Um segundo juiz avalia a triagem em grupos cegos. Os controles congelados contêm paráfrases, desvios de direção e planos genuinamente distintos. Uma dúvida ou rejeição bloqueia o lote antes de gerar pixels. O contrato exige preservar uploads, seleção autorizada e fatos confirmados. A pessoa escolhe a direção.

O custo por arte utilizável usa o custo de todas as gerações observadas de um braço dividido pela quantidade de artes julgadas utilizáveis. O relatório distingue a estimativa por tarifa e a cobrança da conta, declara os componentes desconhecidos e divulga número de pares comparáveis, recusas e abstenções. Os julgamentos de pixels medem a legibilidade e a fidelidade, e a clareza dos pares para um avaliador. A decisão humana de usar o post exige avaliação da pessoa.

## Execução

O diretório de evidências fica fora do repositório. Cada POST tem recibo reservado antes do envio. Uma resposta incerta exige consultar o mesmo recibo ou preservar a lacuna. As gerações do mesmo braço iniciam em paralelo. A espera entre lotes é de 15 segundos a partir da última conclusão. A chave fica em memória do processo de geração. No macOS, o executor pode obtê-la do clipboard mediante autorização da pessoa. As sessões de julgamento usam o login do Codex e recebem somente as entradas sintéticas da bancada.

Os controles e testes locais dispensam credencial.

```sh
node scripts/evals/triagem-divergencia/dataset/verify.mjs
node --test scripts/evals/triagem-divergencia/{runner,planner,metrics}/*.test.mjs
```

A bancada fica isolada dos handlers do estúdio. Uma mudança do planejador ou do despacho em produção depende da comparação entre baseline e candidatas e da decisão do criador.
