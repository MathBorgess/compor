# Arquitetura inicial

**Confirmado:** aplicativo Electron, baixável para uso interno, com geração de conteúdo no próprio app. **Proposto:** a divisão abaixo, React/TypeScript na interface, persistência local de projetos e adaptadores por formato. Não há código implementado nem versões de dependências escolhidas.

## Componentes

| Parte | Responsabilidade proposta |
| --- | --- |
| Interface / renderer | Narrativa por blocos, painel de imagens/formas/cores, comparação e revisão das saídas |
| Main | Ciclo do aplicativo, acesso a arquivos, persistência e integração com o serviço de geração |
| Preload / IPC | Expor operações delimitadas entre interface e main, com entradas validadas |
| Contexto da oficina | Conteúdo, decisões visuais, arquivos e versões aprovadas |
| Adaptadores | Compor contexto da oficina + prompt + skill do formato + pedido do usuário |

Essa separação segue o [modelo de processos do Electron](https://www.electronjs.org/docs/latest/tutorial/process-model), consultado em 20/10/2026. Para a implementação, manter isolamento de contexto e limitar as operações expostas à interface, conforme a [orientação de segurança](https://www.electronjs.org/docs/latest/tutorial/security). Credenciais de IA não fazem parte da skill, dos arquivos da oficina ou do repositório.

## Skill interna por oficina

Estrutura conceitual; os nomes e a persistência definitiva serão fechados na implementação:

```text
oficina/
  SKILL.md       instruções para trabalhar com o contexto aprovado
  context.json   briefing, narrativa, voz e escolhas visuais
  assets/        imagens e referências visuais
  versions/      histórico do contexto
  outputs/       materiais e versão de origem
```

A skill contém instruções; contexto e arquivos preservam o conteúdo. O histórico do chat não é a única memória. As imagens precisam continuar disponíveis, com suas relações aos blocos. Cada geração registra a versão do contexto e do adaptador utilizada; regenerar não deve apagar uma saída aprovada.

## Desktop e distribuição

O usuário baixa, instala e abre o app. Sistemas-alvo, instaladores, assinatura e canal de distribuição interna ainda estão abertos. Empacotar e distribuir são etapas posteriores; ver a [visão oficial de distribuição](https://www.electronjs.org/docs/latest/tutorial/distribution-overview), consultada em 20/10/2026.

Geração dentro do app descreve a experiência do usuário. Fornecedor de IA, credenciais e dependência de rede ainda serão definidos; não foi decidido que o produto funcionará integralmente offline. Sincronização em nuvem também não foi escolhida.
