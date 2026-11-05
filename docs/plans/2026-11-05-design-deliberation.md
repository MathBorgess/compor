# Compor. Entrada, conversa e arte integral

Registro da conversa Codex de 05/11/2026. Base de implementação `7a3d50a4cd3f289b84c3e502d80e3a199e37ef87`. Entrega em uma demo web, seguindo a marca e os padrões do Figma. A interface pode adaptar-se aos agentes e motores mesmo onde o Figma ainda não especifica telas.

## Workflow

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [ ] Phase C: Run the loop
- [ ] Phase D: Keep the audit trail
- [ ] Phase E: Verify and hand back

## Direção confirmada

- A entrada oferece somente Google. Azul, creme, amarelo e os ativos oficiais do Compor orientam a interface. O símbolo terá movimento com alternativa para movimento reduzido.
- GPT Image gera a arte inteira, inclusive título, preço e outros textos que fizerem parte dela. Não existe camada fixa posterior para esses elementos.
- A demo prioriza explorar e refinar um post. A conversa esclarece critérios subjetivos visuais e de mensagem com exemplos e contraexemplos.
- Critérios do criador e hipóteses sobre a persona destinatária ficam separados. Quando entram em conflito, a interface explicita a tensão e o criador decide. Resposta humana confirmada nesta conversa.
- A conversa esclarece somente ambiguidades relevantes. Não há questionário obrigatório em toda geração. Resposta humana confirmada nesta conversa.
- O método Agile Deliberation inspira a descoberta de critérios. Sua avaliação publicada trata de classificação subjetiva de imagens. Qualidade criativa e efeito sobre o público do Compor permanecem hipóteses a validar.

## Contratos existentes preservados

Legenda permanece texto separado da arte. Rascunho, geração, aprovação, download e publicação são ações diferentes. Nova tentativa preserva a versão anterior. O fluxo preserva BYOK, autorização de execução, isolamento por usuário e projeto, limites de consumo e tratamento de resultado desconhecido.

## Descoberta verificada

O backend de autenticação já fixa o provedor Google. O fluxo do Figma ainda contém senha e acesso sem cadastro. O estúdio atual inclui preparação por formulários antes da conversa.

O contrato de geração atual solicita imagem sem texto. A interface sobrepõe título, preço e data e o compositor adiciona os mesmos textos ao PNG. As imagens de referência chegam ao agente conversacional, mas não ao gerador. O contrato de geração e a exportação precisam mudar juntos.

## Unidades e prova

1. Definir o contrato de critérios, referências e operação de imagem. Comparar dois desenhos antes de implementar. Prova por rastreio de chamada, revisão e testes de contrato.
2. Gerar e editar a arte integral. Passar referências autorizadas ao motor, preservar versões e eliminar composição textual local. Prova por testes de payload, referências, exportação e tratamento de falha.
3. Integrar deliberação adaptativa ao estúdio. Prova por conversa com critérios visuais e de mensagem, exemplos e contraexemplos, conflito criador/persona e recuperação de contexto.
4. Ajustar entrada e fluidez visual. Prova no navegador em desktop e mobile, teclado, estados de erro e movimento reduzido.
5. Verificar o caminho completo e preparar PR. Testes determinísticos não comprovam a qualidade de uma imagem real. A evidência de execução real será registrada separadamente.

## Checkpoint de execução

A geração integral é o contrato mais arriscado. Arquitetura e referências podem ser investigadas em paralelo. Alterações de contrato entram antes das interfaces consumidoras. Autenticação, imagem e estado de sessão exigem testes de regressão. A revisão visual terá uma rodada conjunta desktop/mobile e no máximo uma confirmação após correções.

## Síntese da arquitetura

Dois agentes compararam a proposta de prompt com referências implícitas, uma operação imutável e um serviço novo de jobs. Ambos escolheram a operação imutável. Ela vincula prompt, textos, origem e referências ao aceite e reutiliza reservas, recibos e tratamento de resultado desconhecido. Um serviço adicional não foi necessário para a demo. O papel de juiz entre famílias de modelos não foi executado porque o ambiente oferece somente modelos da mesma família.

Critérios pertencem ao estado recuperável do projeto. Uma proposta guarda perspectiva, dimensão, exemplo, contraexemplo e origem. As decisões do criador formam um histórico separado. Aceitar uma hipótese sobre a persona não a transforma em evidência de público. Uma tentativa congela os critérios usados e preserva essa cópia após escolhas posteriores.

## Qualidade e performance

Matheus ampliou o escopo nesta conversa para incluir GitHub Actions e gates de qualidade, manutenção e performance. A frente isolada prepara lint de correção, testes sem credenciais, build de produção, orçamento de JavaScript e Lighthouse móvel com relatórios. SSR, SSG, imagens e importações dinâmicas devem atender ao uso de cada página. O estado privado do estúdio não pode entrar em cache compartilhado para melhorar uma nota.

O fluxo final foi confirmado pelo dono. Google leva à conversa, briefing e persona são progressivos, chave e consumo aparecem quando necessários, imagens são integrais e versões anteriores permanecem disponíveis.

## Fontes

- [Figma de entrada](https://www.figma.com/design/8nEzYvk8LCTQzbknMgEw1c/Compor?node-id=211-9627).
- [Agile Deliberation](https://research.google/blog/agile-deliberation-how-ai-helps-humans-define-the-gray-areas/).
- [Magnific](https://www.magnific.com/ai/image-generator#workflow).
- [ADR anterior](../adr/0007-arquitetura-web-e-byok.md).

## Escopo adicional confirmado em 05/11/2026

Matheus pediu incorporar código do Agile Deliberation ao MCP com proveniência e arquitetura atualizadas. A adaptação distingue classificação visual no estudo original de critérios criativos do Compor. Fontes copiadas terão commit fixado, licença e mapa de métodos.

Matheus também pediu migrar a aplicação Next.js para TypeScript. Componentes passam a TSX, rotas e lógica a TS, com tipagem estrita e gate de compilação. A migração preserva os comportamentos e testes da arte integral, histórico e autorização.
