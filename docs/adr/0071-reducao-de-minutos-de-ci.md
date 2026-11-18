# ADR 0071 — Redução de minutos de CI

- Estado: decisão solicitada em 18/11/2026, implementação verificada localmente
- Fonte: Matheus solicitou aplicar as três melhorias do diagnóstico de Actions, registrar a rotina no `AGENTS.md` e testar `ubuntu-slim`.

## Decisão

Agrupar pushes autorizados após a validação local e confirmar o Quality no commit final. O Quality continua executando nos PRs e por disparo manual. O job estático classifica o diff antes de instalar dependências e encerra após a classificação quando há apenas documentação e skills nas regras de escopo. Esta condição substitui a execução incondicional da suíte estática descrita no [ADR 0032](0032-gates-por-area-e-falha-rapida.md). Os checks dependentes continuam sujeitos ao gate agregado. Um diff desconhecido e a execução manual mantêm a cobertura completa.

Os jobs Static e Performance compartilham a chave npm da raiz e da web quando o site fica fora do escopo. As instalações pela raiz registram timings do npm. Nos testes Chromium, o relógio das fixtures avança de forma controlada em verificações repetidas de espera. Os testes de janela em tempo real continuam na suíte. O avaliador de performance encerra antes de iniciar Lighthouse se o bundle já exceder o limite em bytes. Builds elegíveis passam pelas cinco medições e pelos mesmos limites.

O `Quality gate` usa `ubuntu-slim`. O smoke isolado de 18/11 validou checkout, Node 24, decisão do agregador, consulta dos jobs com `actions: read` e geração do resumo. O job levou 19 segundos e estimou um minuto arredondado. A diferença de tarifa nessa faixa é de US$ 0,004 por execução. [Smoke no Actions](https://github.com/MathBorgess/compor/actions/runs/44366392500) · [Tarifas](https://docs.github.com/en/billing/reference/actions-runner-pricing)

## Como verificar a economia

No Mac, com o mesmo Chromium e comandos antes e depois da alteração de testes, o arquivo de seleção de referências passou de 153,57 s para 84,57 s, com 19 casos aprovados em ambas as medições. O cenário isolado de pausa no briefing passou de 28,44 s para 11,05 s. Esses tempos medem o arquivo e o cenário isolados.

A suíte Chromium completa passou com 697 casos. O build local passou com cinco medições Lighthouse e 273.801 bytes gzip no bundle. Um controle com um chunk sintético acima do limite encerrou com zero medições e gerou o diagnóstico, inclusive quando a pasta local já continha relatórios de uma execução anterior.

Compare duração do Chromium e tempo até o `Quality gate` para a mesma revisão com cobertura equivalente. Compare também os minutos arredondados, diferencie cache quente de cache frio e confira o crédito no painel de cobrança. A economia dos outros jobs precisa de medição em PRs representativos no GitHub, incluindo um PR só de documentação e um PR web com e sem cache.
