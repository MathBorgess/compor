# ADR 0053 — Integração da main e decisões de usabilidade

- Data: 15/11/2026.
- Fonte: revisão dos conflitos entre `feat/frontend-usability` e `origin/main` e aprovação explícita da pessoa para manter as mudanças de IA, modais, conversa e referências da main.
- Estado: implementado para avaliação local.

A integração preserva os sete commits locais até `5ff7907` e incorpora `origin/main` em `828dc60`, incluindo `5b6783a` e `977e1e8`. Não escolhe uma versão inteira dos arquivos conflitantes: mantém as correções de isolamento e indisponibilidade, junto ao nome organizacional, confirmação de criação e exclusão lógica de posts do ADR 0051, exclusão de projetos, menu lateral global e cards/espaçamentos locais.

Por nova decisão explícita, Configurações do projeto e Referências seguem os modais de viewport com abas, conteúdo rolável e saída visível da main. Substitui a apresentação em página do ADR 0050; seu registro histórico permanece. O componente de página e `workspacePage` foram removidos. Os diálogos de confirmação e configurações específicas do post mantêm suas dimensões próprias. O controlador da conversa permanece montado; referências do post podem receber seu painel por portal, sem outro turno ou perda do rascunho.

O chat passa a usar apenas minimizar/reabrir, com divisão ajustável no desktop e sobreposição ao editor no celular. Materiais e versões oferece atalhos para posts/versões e conserva os arquivos da versão escolhida, sem duplicar o catálogo. Remoção e reativação de referências ficam em Sua seleção; busca e galeria só indicam seleção. Preferência inicial de projetos novos é a IA do Compor, sem autorizar geração por abertura, disponibilidade ou reload. Preferências antigas são preservadas.

O documento vindo da main como `0047-ia-inicial-e-jornada-unica-no-estudio.md` foi renumerado para ADR 0052 para não colidir com o ADR 0047 de exclusão de projetos. Fonte, decisão e evidência histórica não foram descartadas. Os testes de navegação foram adaptados à combinação final, mantendo a criação explícita do post antes de preparar um turno.

Não muda os limites de geração, consentimento externo, tratamento de resultados incertos, BYOK, snapshots ou autorização. As migrations 00029 e 00031 são verificadas localmente com PostgreSQL embarcado em PGlite; isso não comprova aplicação remota, configuração do Supabase ou rollout de produção.
