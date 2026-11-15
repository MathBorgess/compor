# Configurações em página — verificação local

Conforme o [ADR 0050](../adr/0050-configuracoes-do-projeto-em-pagina.md), as configurações usam a área principal e as seções ficam no menu lateral. O conteúdo de origem permanece montado, oculto, até o retorno.

- ESLint e tipos estritos aprovados; build de produção aprovado em cópia isolada.
- Cinco cenários finais em Chromium aprovados: preparação e configuração em desktop e celular, alcance global das referências, navegação pelas seis seções, histórico somente para leitura, contexto preservado, chat não enviado preservado e retorno à revisão/editor. Sem erros de página nas fixtures.
- Os dois cenários de workspace e revalidação de identidade passaram após ajustar o menu para recolher ao voltar da página e ao entrar no breakpoint do celular. A exportação preservou os bytes da arte, e a troca de conta limpou a credencial da sessão.
- Inspeção visual local em 1440 e 390 pixels das seções Contexto, IA e Referências e do menu expandido, usando projetos fictícios em contextos isolados do navegador.
- Contexto recebido na conversa foi conferido em um cenário existente. O retorno às referências do post também passou: imagem e origem preservadas, rascunho não enviado mantido, leitura visível na própria página e uma única análise por seleção, sem repetição ao reabrir. O painel usa o mesmo controlador de conversa por portal React.
- Ajuste posterior de alinhamento: o card Sugestões do Pinterest usa o mesmo espaçamento interno de Sua seleção. Medições e inspeção visual em 1918 e 390 pixels confirmaram bordas e títulos alinhados na preparação e nas configurações, sem rolagem horizontal ou erros de página. Build de produção aprovado após o ajuste de CSS.

Sem geração paga, migration, alteração de contratos de domínio ou push. O ambiente privado de revisão continua local; seus projetos não foram apagados. Não se declara aprovação de todos os gates, CI Linux, deploy ou isolamento entre contas reais. Performance não foi reavaliada.
