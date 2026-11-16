# Referências por etapa

Proposta 2 escolhida por Matheus em 16/11/2026. Implementação autorizada na mesma conversa. Objetivo: enxergar imagens e decidir referências antes do primeiro post, com menos controles simultâneos. Este documento preserva o contrato escolhido. A implementação e suas verificações são registradas no ADR 0058 e no relatório de qualidade.

## Diagnóstico observado

A captura fornecida mostra o título repetido, seis abas de configurações, quatro ações de fonte, seleção e conversa no mesmo modal. Os elementos legíveis disputam espaço vertical com a galeria.

No código local, `apps/web/app/studio-reference-panel.tsx:14` compõe cabeçalho, exploração, seleção e conversa simultaneamente. A linha 28 mistura abrir Propostas com pedir geração. `apps/web/app/reference-workbench.css:7` fixa quatro linhas no viewport e reserva ao chat pelo menos 220px ou 31% da altura. As linhas 24, 27 e 38 acrescentam rolagens internas. Esta é uma explicação plausível da compressão observada, não uma reprodução instrumentada da captura.

A proposta mantém DM Sans, branco, creme #f4f0e5, azul #123eab, tinta #2c2d2f e linhas #dedfd9 de `apps/web/app/studio-shell.css:4`. Experience First orientou imagens legíveis e escolhas reversíveis. Subtract Before You Add retirou o título duplicado, as abas de configurações e o chat permanente. Model the Domain separou etapa, origem e estado de exploração.

## Direção visual

Uma página dedicada apresenta a tarefa atual. Uma trilha discreta mostra Contexto, IA, Referências opcionais e Pedido. As duas primeiras etapas aparecem concluídas no primeiro uso. A reabertura de referências de um post mostra apenas o caminho do projeto/post, sem refazer a preparação.

O título é “Escolha o que inspira este post”. A frase auxiliar diz “Referências são opcionais. Escolha imagens ou continue sem elas.” Uma linha apresenta a fonte e, quando necessário, sua busca. Pinterest, Enviar imagem e Propostas são fontes. Entrar em Propostas mostra o histórico. “Pedir 3 propostas” é um botão próprio, fora do seletor.

A galeria ocupa toda a largura útil. Três imagens de pelo menos 300px cabem na tela ampla. Não há painel lateral. Cada imagem possui ações separadas de ampliar e escolher. O rodapé da etapa resume a seleção e oferece “Comentar seleção”, “Preparar primeiro post” ou “Continuar sem referências”. O comentário é opcional.

Ao abrir a conversa, o conteúdo principal alterna para a conversa existente. “Voltar às imagens” recupera seleção, origem e rolagem. A mesma sessão e o mesmo executor permanecem ativos. Não acrescentar outra caixa de chat. Uma pergunta pendente pode aparecer como linha resumida com “Responder”, sem abrir a conversa ou roubar foco automaticamente.

## Fluxo proposto

1. A pessoa preenche contexto e escolhe IA. A IA escolhida aparece como resumo e pode ser alterada em Configurações. Não se cria imagem.
2. A pessoa escolhe referências, envia uma imagem ou pede explicitamente um lote opcional de três propostas. Pode seguir com zero referências.
3. “Preparar primeiro post” abre o formulário `workflow.pendingPost` com nome obrigatório, objetivo, mensagem e CTA opcional. Esta ida direta é uma simplificação proposta. Hoje o ADR 0054 leva primeiro à lista vazia e exige “Criar novo post”.
4. O formulário apresenta o alcance das referências e permite voltar. A confirmação registra o nome via `/api/posts`; somente o recibo válido cria o post local. Não antecipar a criação no clique das referências.
5. O rascunho abre com a candidata v0 elegível, caso exista. Usar seus bytes não gera outra imagem nem a aprova. Na ausência dela, o rascunho vazio aguarda pedido explícito de geração.
6. Ao reabrir referências de um post existente, “Voltar ao post” conserva rascunho, imagem, versões e conversa. Não substitui uma imagem existente pela escolha de outra referência.

A confirmação do formulário continua sendo a existente. A proposta não acrescenta um modal de aprovação de cada geração.

## Contrato de estado

Este é um modelo para implementação posterior, não uma migração criada agora.

- `entry` é `project-preparation` ou `existing-post`. A segunda alternativa exige `postId`.
- `surface` é `gallery` ou `conversation` e não altera a sessão da conversa.
- `source` é `pinterest`, `upload` ou `proposals`. Trocar source só muda visualização.
- `selection` contém até 20 IDs únicos e alcance explícito por referência. Escolher não aprova estética nem confirma uma preferência global.
- `exploration` distingue `idle`, `generating`, `cooldown`, `awaiting-user`, `paused` e `unknown`.
- `selectionReading` mantém revisão da seleção e prazo de estabilização. Alteração real reinicia 5s; abrir a tela, ampliar ou mudar fonte não reinicia o prazo.
- Preparação inicial conserva alcance de projeto. Reabertura mostra o alcance efetivo do post. O resumo de seleção informa esse alcance; não inferir compartilhamento pelo layout.
- `generationIntent` nasce de um pedido explícito e permanece separado dos campos anteriores.

## Contrato HTML

Trecho estrutural da galeria. Os caminhos de imagem são exemplos de contrato, não arquivos fornecidos.

```html
<main class="reference-step" aria-labelledby="references-title">
  <nav aria-label="Preparação do projeto">
    <ol class="preparation-steps">
      <li>Contexto concluído</li>
      <li>IA escolhida</li>
      <li aria-current="step">Referências opcionais</li>
      <li>Pedido do post</li>
    </ol>
  </nav>
  <header class="step-heading">
    <h1 id="references-title" tabindex="-1">Escolha o que inspira este post</h1>
    <p>Referências são opcionais. Escolha imagens ou continue sem elas.</p>
  </header>
  <form class="source-controls" aria-label="Buscar referências">
    <label>Fonte
      <select name="source">
        <option>Pinterest</option>
        <option>Enviar imagem</option>
        <option>Propostas do Compor</option>
      </select>
    </label>
    <label class="search-query">O que você quer explorar?
      <input type="search" name="query" value="Café acolhedor, luz natural">
    </label>
    <button type="submit">Buscar</button>
  </form>
  <ul class="reference-grid" aria-label="Referências encontradas">
    <li class="reference-item">
      <figure>
        <button class="reference-preview" type="button"
          aria-label="Ampliar referência Café com luz natural">
          <img src="reference-coffee.jpg"
            alt="Xícara de café sobre mesa de madeira iluminada por uma janela">
        </button>
        <figcaption>Café com luz natural</figcaption>
      </figure>
      <div class="reference-actions">
        <label class="selection-control">
          <input type="checkbox" name="references" value="coffee-light" checked>
          Escolhida
        </label>
        <a href="reference-source">Ver origem</a>
      </div>
    </li>
  </ul>
  <footer class="step-actions">
    <div class="selection-summary">
      <p role="status" aria-atomic="true">2 referências escolhidas</p>
      <button type="button" aria-controls="reference-conversation">
        Comentar seleção
      </button>
    </div>
    <button type="button" class="primary">Preparar primeiro post</button>
  </footer>
</main>
```

No estado de conversa, renderizar `reference-conversation` na mesma posição principal. Ao alternar, mover foco para seu título; ao retornar, devolver ao botão que abriu a conversa. A navegação por etapa move foco para o h1. Ampliar abre dialog acessível com Escape e retorno ao botão original. Botão de ampliar não seleciona e checkbox não amplia.

## Contrato CSS

Valores em pixels CSS. Não há altura fixa da galeria, corte de imagens ou redução de fontes para fazer tudo caber.

```css
.reference-step {
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-5: 48px;
  box-sizing: border-box;
  width: min(1200px, calc(100% - 64px));
  margin-inline: auto;
  padding-block: 32px 48px;
  color: #2c2d2f;
  font: 400 16px/1.5 "Compor DM Sans", sans-serif;
}
.reference-step *,
.reference-step *::before,
.reference-step *::after { box-sizing: border-box; }
.preparation-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0 0 32px;
  padding: 0;
  list-style: none;
  font-size: 14px;
}
.step-heading { margin-bottom: 32px; }
.step-heading h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.25; }
.step-heading p { margin: 0; max-width: 65ch; }
.source-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 16px;
  margin-bottom: 32px;
}
.source-controls label { display: grid; gap: 8px; min-width: 0; }
.search-query { flex: 1 1 280px; }
.source-controls :is(input, select) {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 10px 12px;
  font: inherit;
}
.reference-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 32px 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.reference-item { min-width: 0; }
.reference-item figure { margin: 0; }
.reference-preview {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #f4f0e5;
}
.reference-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 10px;
}
.reference-item:has(input:checked) .reference-preview { border-color: #123eab; }
.reference-item figcaption { margin-top: 12px; font-size: 16px; overflow-wrap: anywhere; }
.reference-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.selection-control { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; }
.selection-control input { width: 20px; height: 20px; accent-color: #123eab; }
.reference-step button,
.reference-step a { min-height: 44px; min-width: 44px; }
.reference-actions a { display: inline-flex; align-items: center; }
.reference-step button { font: inherit; cursor: pointer; }
.reference-step :focus-visible { outline: 3px solid #123eab; outline-offset: 3px; }
.step-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid #dedfd9;
}
.selection-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; }
.primary { padding: 12px 24px; border: 0; border-radius: 10px; background: #123eab; color: white; }
@media (max-width: 767px) {
  .reference-step { width: calc(100% - 32px); padding-block: 24px 32px; }
  .preparation-steps { margin-bottom: 24px; gap: 8px 16px; }
  .source-controls { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .reference-grid { grid-template-columns: 1fr; gap: 32px; }
  .step-heading h1 { font-size: 24px; }
  .step-actions { align-items: stretch; }
  .step-actions > .primary { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .reference-step * { scroll-behavior: auto; animation: none; transition: none; }
}
```

Com largura máxima de 1200px e gap de 24px, três colunas medem 384px. Duas colunas aparecem quando a área útil fica abaixo de 948px. Até 767px de viewport, a proposta usa uma coluna explicitamente. Em 320px, a área útil é 288px. São dimensões derivadas das regras, não medições de um navegador.

Há uma única rolagem vertical de documento. Header e rodapé permanecem no fluxo. Aceitar rolagem é preferível a comprimir a arte. Não usar `overflow:hidden` em ancestrais da página. Em zoom de 200%, o layout deve redistribuir colunas e manter todos os controles acessíveis. A execução dessa verificação fica para a implementação.

## Esperas e autorização

- Pinterest exige o consentimento já previsto por sessão da conta. Antes dele, não carregar prévias externas. A imagem conceitual representa uma sessão com essa permissão concedida.
- Selecionar atualiza visual e contador imediatamente. A leitura da seleção espera os 5 s já definidos em `selection-reading-timer.ts:2`. Mostrar a condição quando houver leitura programada, sem confundi-la com salvamento.
- A geração opcional continua sequencial em lotes de 3. O intervalo de 15 s de `exploration-batch.ts:5` fica visível como “Próximo lote em 15 s”, com “Pausar exploração”. Só aparece se há exploração explicitamente iniciada e elegível para continuar.
- Pergunta pendente, duas rodadas sem resposta, saída das referências, chave desconectada, sessão encerrada e resultado desconhecido mantêm seus bloqueios. Contador chegando a zero não supera esses bloqueios.
- Anunciar por `role=status` transições de estado, não cada segundo. Não mudar foco por geração ou atualização de resultados. Reservar espaço da imagem para evitar salto.
- `data-phase`, `aria-busy`, nome acessível e mensagem literal refletem o mesmo estado. CSS não controla cronômetro, autorização ou retomada.

## Exclusão e aprendizados

A exclusão lógica já existe. `studio-app.tsx:285` confirma retenção, `studio-app.tsx:300` oferece lixeira no cartão e a migration00030 grava `deleted_at`. O ADR0047 declara que posts, imagens, históricos e armazenamento local permanecem. Não equivale a apagar dados nem a revogar acesso de outros clientes.

A proposta torna “Excluir da lista” descobrível no menu do projeto e conserva a confirmação atual com texto direto. A ação fica fora da galeria. Não executar nova inferência nem copiar perfil durante a exclusão.

Os sinais atuais continuam vinculados às suas fontes. A busca usa sinais do projeto em `reference-exploration.ts:49`; o histórico elegível da conta já permite algum reaproveitamento. Isso não demonstra um perfil durável que a pessoa possa consultar e editar após a exclusão. Esse perfil é um requisito futuro separado, com origem e alcance explícitos. Preços, datas, público e marca de um projeto não viram preferências gerais por inferência.

## Debate com a alternativa de galeria lateral

O colega apontou que reservar geração só para o pedido final apagaria a exploração opcional já aprovada. Aceitei. A proposta preserva a fonte Propostas, o botão explícito de lote e a candidata v0 vinculada.

O colega propôs “Comentar seleção” perto do contador para evitar que a conversa sob demanda desapareça da jornada. Incorporei a ação sem torná-la obrigatória e sem criar outra sessão.

Critiquei o uso de três colunas mais aside de 320px num viewport de 1200px. O colega aceitou mínimo de 300px por imagem e retirou histórico e configurações simultâneas do aside. As duas alternativas convergem em imagens sem corte, geração explícita e comentários opcionais. Diferem na comparação paralela da seleção: minha proposta usa uma etapa focada; a outra mantém a seleção ao lado.

Minha recomendação para quem prepara o primeiro post é esta etapa focada. Ela exige menos decisões simultâneas. Para quem reabre referências com frequência, a lateral oferece revisão mais rápida. Isso é julgamento de projeto e ainda precisa da escolha de Matheus e de teste de uso.

## Direção para imagem de proposta

Gerar um único frame desktop 1440×1120, sem navegador, sem moldura de dispositivo. Manter marca Compor e paleta acima. Projeto fictício “Café Aurora”. Topo branco simples com marca e projeto. Trilha discreta Contexto, IA, Referências opcionais, Pedido. Título “Escolha o que inspira este post”. Fonte Pinterest e busca “Café acolhedor, luz natural”. Três referências grandes em grade, cenas de café reais e distintas, primeira e terceira escolhidas. Legendas curtas e checkbox visível. Rodapé em fluxo com “2 referências escolhidas”, “Comentar seleção” e um único CTA azul “Preparar primeiro post”. Não desenhar chat, tabs de configurações, métricas, perfil ou exclusão nessa tela. Não adicionar anotações de CSS na imagem.

## Ajuste após a imagem gerada

A imagem mostrou molduras quadradas. O contrato adota `aspect-ratio:1/1` com `object-fit:contain`. Uma referência vertical permanece integral com espaço lateral, sem crop. Em1200px de largura útil, cada moldura mede384×384px. O tamanho é derivado do CSS, não medido no mock. A mudança conserva espaço para o resumo e a próxima ação, sem comprimir as imagens pela altura da janela.

## Limites da entrega

Documento e imagem servem à escolha de direção. Não demonstram HTML renderizado, contraste calculado, foco, teclado, CSS, retenção real em produção, tempo nem AX. Não houve edição de produto, exclusão de projeto, chamada de fornecedor do Compor, migration ou deploy.
