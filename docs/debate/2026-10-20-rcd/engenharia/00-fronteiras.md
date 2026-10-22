# Fronteiras para um serviço implementável

20/10/2026 · Engenharia de software e IA · rodada inicial. Base: commit `9c8bfedd780d613519accdb93c0752e5234a687e`, [briefing](../brief.md), [spec](../../../specs/experiencia-desktop-oficina.md) e mini documentação. Este memo propõe critérios; não escolhe persona nem representa implementação ou validação comercial.

Método: [Revenue-Centric Design, Richard (@richardrx), revisão fixada `1942760`](https://github.com/heliocosta-dev/revenue-centric-design/tree/1942760c2242f609bf63ce2c97204f5a1791bd68), com as referências positioning-icp-and-gtm, pricing-and-monetization e metrics-and-experimentation carregadas. [Termos integrais](../RCD-LICENSE.txt), inclusive exclusão de apostas, cassinos e jogos de azar. Exemplos e números da fonte não são benchmarks deste serviço.

## Invariantes do autor

- Aplicativo Electron baixável, utilizado internamente; a oferta comercial precisa funcionar nessa experiência.
- Narrativa construída com imagens, formas e cores visíveis durante a criação.
- Contexto e recursos visuais preservados numa skill interna por palestra/oficina.
- Cada formato combina contexto, prompt e skill próprios; geração acontece no app. Pitch deck, LinkedIn e Instagram são os exemplos confirmados.
- Execução atual restrita a documentação. A spec canônica permanece sem alteração até o encerramento do debate.

Nome e público anterior são provisórios. “Interno” ainda precisa ser esclarecido comercialmente: quem instala, quem opera e quem paga podem ser pessoas diferentes. Desktop não estabelece inferência offline ou confidencialidade perante um fornecedor de IA.

A [evidência pública do orquestrador](../evidencias-orquestrador.md), O1–O3, registra sobreposição de formatos/marca com Gamma e Canva e divulgação parcial na Sympla. A skill interna é um mecanismo; a diferenciação precisa aparecer na comparação do trabalho completo, com os limites dessa evidência preservados.

## Escolhas abertas e suas consequências

SO e instalação definem acesso ao piloto e esforço de suporte. Modelo, credenciais e rede definem custo, disponibilidade e exposição dos dados. Exportadores definem se o resultado chega ao canal de uso. Persistência, backup e portabilidade definem recuperação. Capacidade do grupo e participação humana definem o que pode ser prometido. React/TypeScript, templates e persistência local continuam propostas.

Um deck visível no app não prova que alguém consegue apresentá-lo ou editá-lo onde precisa. A unidade comercial deve declarar formatos técnicos, limites de páginas/cartões, revisões, prazo, suporte e responsabilidade pelo acabamento antes de atribuir preço.

## Fronteiras propostas

| Responsável | Contrato de valor e limite |
| --- | --- |
| Autor/operador | Fornece fatos e recursos autorizados; aprova narrativa e saídas. IA não inventa provas, clientes ou resultados. |
| Editor | Permite intervenção manual e comparação; sugestões não substituem edições aprovadas. |
| Contexto da oficina | Separa instruções, conteúdo, recursos e versões; reabertura preserva imagens e relações. Material importado não ganha autoridade de instrução. |
| Adaptador de formato | Recebe versão aprovada e objetivo; produz rascunho revisável e registra sua origem. |
| Geração | Encapsula fornecedor, orçamento, falha e repetição; credenciais ficam fora da oficina e do renderer. |
| Desktop | Interface isolada; arquivos e outras operações privilegiadas passam por uma ponte estreita validada. Conteúdo gerado é tratado como dado. |
| Exportação | Gera arquivo utilizável, conferido fora do app; declara perdas de edição e fidelidade. |
| Prestador do serviço | Explicita configuração, revisão e suporte humanos incluídos; contabiliza esse trabalho. |

As divisões desktop seguem o [modelo de processos](https://www.electronjs.org/docs/latest/tutorial/process-model) e as [recomendações de segurança](https://www.electronjs.org/docs/latest/tutorial/security) do Electron. Distribuir também exige planejar empacotamento, assinatura e atualização, conforme a [documentação oficial](https://www.electronjs.org/docs/latest/tutorial/distribution-overview). Fontes consultadas em 20/10/2026; indicam obrigações técnicas, não provam viabilidade deste produto.

## Principal teste de valor

**Prova antes da promessa:** comparar o processo atual da pessoa com criar uma oficina, escolher visuais, salvar, fechar/reabrir e obter duas saídas utilizáveis da mesma base, sem repetir briefing. Oferecer uma demonstração com entrada e saída inspecionáveis antes de pedir instalação; a demonstração é planejada, ainda inexistente. Depois, observar o fluxo instalado completo.

Registrar tempo total até material aprovado, correções factuais/visuais, repetições de contexto, falhas de exportação, ajuda humana e gasto de IA. Incluir instalação/configuração e acabamento externo; contabilizá-los separadamente ajuda a localizar o problema. Concordar antecipadamente com o usuário sobre o que é “utilizável”.

**Ativação:** concluir esse ciclo com resultado aproveitável, não baixar ou abrir o app. Retorno significa reaproveitar a oficina numa próxima necessidade real; frequência de palestra não se deduz de D1/D7. Comparar pessoas e trabalhos equivalentes; pouca amostra permite aprendizado qualitativo, sem alegar significância. Simulação com agentes não mede demanda.

## Economia e decisões necessárias

**Piso de custo e teto de valor:** por unidade vendida, contar IA, tentativas, imagens/licenças, suporte, revisão humana, distribuição e taxas; registrar aquisição e manutenção para verificar sustentabilidade. Se preço líquido menos custos atribuídos não sustenta a entrega, reduzir escopo ou recalcular. Tempo economizado só sustenta teto de valor se observado e valorizado pelo comprador. Evitar uso ilimitado antes de medir consumo.

RCD e usuário precisam resolver: quem paga/opera; ocasião e alternativa atual; saída indispensável e arquivo exigido; permissão/capacidade para instalar e enviar contexto à IA; nível de ajuda e revisões aceitáveis; frequência e benefício mínimo que justificariam compra. O teste comercial posterior exige decisão real de compra, com termos claros e autorização própria. Se instalação inviabiliza acesso, exportação falha ou retrabalho elimina a economia, o desenho precisa mudar antes de crescer aquisição.
