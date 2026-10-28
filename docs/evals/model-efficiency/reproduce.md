# Reproduzir e revisar o ensaio

Este pacote é um estudo local, não um backend de produção. Os prompts, respostas, chamadas MCP, planos, PNGs, notas e falhas são evidência preservada. Todos os casos são fictícios.

## Ler primeiro

1. `README.md`: resultado e limites da rodada.
2. `rubric.md` e `protocol.md`: critérios anteriores às respostas.
3. `adaptation-01.md`: substituição da segunda réplica low por medium.
4. `runs/<run_id>/turn-*.json`: prompts efetivos, anexos e respostas.
5. `tN-artifacts*/`: envelopes originais, ligação às chamadas MCP e entradas do compositor.
6. `advance-tN*.json`: renderização, hashes e estado de continuação; falhas não são sobrescritas.
7. Relatórios dos Judges: notas por peça, transcrição e evidência. Mapas de cegamento são externos ao pacote entregue ao Judge.

## Executar os testes locais

```sh
cd prototypes/compor-mcp
npm ci
npm test
cd ../..
python3 -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency/runtime -p 'test_*.py'
python3 -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency -p 'test_*.py'
python3 -m unittest discover -s prototypes/compor-mcp/evals/model-efficiency/render -p 'test_*.py'
```

Os dois últimos comandos precisam de Pillow. O contrato de fontes fixa arquivos reais de Arial/Georgia no macOS; a reprodução visual exata exige esses mesmos bytes. Não há fallback silencioso. A execução registrada usou Python3.12 para Codex/MCP e o Python do runtime desktop com Pillow para composição. As versões/hashes efetivos estão nos relatórios. Os testes do runner simulam o processo; não consomem o serviço de IA.

## Novas execuções

Use IDs e destinos novos. `run_planning.py --schedule ARQUIVO --first N --last N` executa a fatia explícita até T3; recusa diretórios existentes. `schedule.json` e `schedule-medium.json` são registros desta rodada: não sobrescrever os runs. O runtime usa a autenticação nativa do Codex, não copia tokens nem configura BYOK. Uma nova execução consome o serviço do usuário; preços/cobrança não foram medidos neste estudo.

Após T3, `artifacts.py` extrai os pedidos; a ferramenta nativa de imagem executa o prompt literal. `record_asset.py` registra o arquivo retornado, hash e duração. Um mapa `assets.json` liga IDs opacos a arquivos locais. `advance.py` confere o plano contra MCP, compõe e prepara o próximo turno. `run_followups.py` retoma T4/T5 preservando prompts anteriores e anexando os PNGs. Imagens não são geradas novamente em T4/T5.

O gerador de imagem é coordenado externamente e sua versão exata não foi exposta. Não existe comando único que reproduza geração estocástica, credenciais nativas e disponibilidade do serviço. O renderer é determinístico nos bytes/fontes/runtime registrados. Paths absolutos refletem a máquina do ensaio; copiar o repositório não recria sessões nativas nem autoriza reescrever a evidência.

## Métricas e falhas

`usage_cli` acumula o chat retomado: não somar cada checkpoint. O agregador usa o último contador confirmado e deltas verificáveis. Uso ausente em uma tentativa falha permanece desconhecido. Tempos de modelo, geração, render/verificação e coordenação ficam separados; parcelas incluídas em outras não são somadas. Cache não equivale a cobrança gratuita.

Correções de relatório geram saídas novas, como `metrics-low-v2`, preservando a versão anterior. Uma falha por indisponibilidade é diferente de plano inválido, overflow ou resultado visual abaixo da rubrica. A ausência de PNG impede avaliação visual, sem nota substituta.

Uma nota alta de Judge não é aprovação humana, comprovação de benefício real, autorização para publicar nem promoção do harness. O default MCP continua E0. A proposta E2 não foi implementada nem avaliada.
