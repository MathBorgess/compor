# Compor: produto e escopo inicial

20/10/2026. Esta definição substitui o recorte anterior de oficinas e o exemplo de fotografia. A [revisão](revisao/2026-10-20-compor/README.md) preserva a origem das mudanças.

## Proposta de valor

Compor ajuda o dono de um produto digital a criar e atualizar uma divulgação visual, preservando informações e escolhas aprovadas.

A pessoa constrói a mensagem enquanto vê texto, imagens, formas e cores. O aplicativo mantém uma base interna do produto. Quando preço, data ou condições mudam, a pessoa revisa o material sem reconstruir o projeto.

A hipótese comercial é reduzir esforço e erros de atualização. A criação do material, sozinha, permite prometer apenas esse resultado. Atrair público e vender também dependem da oferta, do canal e da demanda.

## Público e ocasião

O texto da designer define donos de negócios digitais. Para pesquisar esse grupo, os agentes propõem um recorte inicial menor.

- Dono solo de um curso gravado que já vendeu.
- Usa Mac e prepara uma divulgação nos próximos 14 dias.
- Tem fatos da oferta e imagens autorizadas.
- Atualiza materiais semelhantes e consegue mostrar duas mudanças recentes de preço, data ou condição.
- Hoje resolve a tarefa com ChatGPT, Canva ou modelos próprios.

O próprio dono opera e pode pagar pelo aplicativo. Os compradores do curso recebem o material final. A conta usada para gerar conteúdo pertence ao usuário; elegibilidade e limites exigem confirmação.

Esse recorte serve à primeira pesquisa. A dor e a disposição para pagar continuam como hipóteses. A empresa ainda precisa observar o uso recorrente e o esforço de mudança.

## Primeira versão proposta

Um usuário, um negócio, um produto digital e uma publicação estática por projeto. O material contém arte e texto de apoio. Uma cópia do projeto conserva a base, imagens e versões.

Proposta técnica: arte no formato de imagem (PNG) e legenda em texto simples (TXT). A arte tem 1080 × 1350 pixels. Uma cópia privada permite restaurar o projeto. A equipe precisa testar esses formatos antes de anunciá-los como disponíveis.

O formato de imagem serve ao caso-guia de uma publicação vertical. O arquivo conserva sua edição dentro do Compor. Outros editores recebem a imagem final, sem promessa de camadas editáveis.

## Fluxo principal

1. Abre um exemplo fictício ou cria um projeto.
2. Informa produto, público, objetivo, preço, datas, condições e endereço de compra.
3. Confirma fatos, marca lacunas e registra omissões intencionais.
4. Escolhe fotos e organiza a narrativa com formas e cores.
5. Confere os dados e autoriza a tarefa externa de geração.
6. Aceita, rejeita ou edita as sugestões dentro do aplicativo.
7. Salva uma versão aprovada e exporta arte e legenda.
8. Muda o preço, compara versões e aprova ajustes por bloco.
9. Fecha, reabre e recupera o projeto com suas imagens.

A preparação manual fica disponível antes do login. A geração exige conexão e acesso válido. Abrir, editar e exportar trabalho existente continua disponível sem nova geração ou renovação.

## Exemplo para desenho e teste

Ana divulga o curso fictício Organize Sua Semana. Ela informa R$97, uma data fictícia e um endereço de compra de exemplo. Ela escolhe sua imagem, organiza a mensagem e aprova o material.

Depois, Ana informa R$127. O aplicativo mostra a alteração ao lado da arte e da legenda. Ana preserva a imagem e um título editado manualmente. Cada aprovação gera uma versão; a anterior continua disponível.

O aplicativo aponta relações conhecidas entre fatos e blocos. A pessoa confere o material completo para encontrar impactos que a detecção automática perdeu. Essa revisão evita prometer conferência infalível.

## Direções do autor e propostas técnicas

Matheus definiu Electron para macOS, conexão inicial com ChatGPT/Codex e sua máquina Oracle de um processador e um gigabyte (GB) como backend. São direções de arquitetura, sem implantação ou capacidade comprovada.

A proposta mantém edição, imagens, versões e exportação no Mac. O backend serve metadados da versão e recebe diagnósticos autorizados. Ele fica fora do caminho necessário para recuperar arquivos existentes.

O [contrato técnico](arquitetura.md) define como testar integração, dados e limites. O acesso oficial a modelos para um aplicativo pago permanece como condição anterior à venda.

## Diferenciação que precisa aparecer no uso

Canva e Adobe já oferecem criação visual e recursos reutilizáveis. [Fontes e limites](revisao/2026-10-20-compor/fontes-consultadas.md) detalham essa sobreposição.

A hipótese do Compor combina uma oferta estruturada, revisão de mudanças e projeto local recuperável. O teste compara esse caminho com o material e os modelos que a pessoa já usa. Tempo total, qualidade e recuperação precisam justificar instalação e preço.

## Fora da primeira versão

Vídeos, animação, carrosséis, pitch deck e LinkedIn como adaptador próprio ficam para avaliação posterior. A visão de múltiplas saídas permanece no histórico do produto.

Publicação automática, anúncios, cobrança do curso, clientes, loja e análise de campanhas ficam fora do recorte. Colaboração simultânea, sincronização e geração de imagens também ficam para outra etapa.

O aplicativo usa imagens que a pessoa fornece com autorização. A base interna reúne contexto e instruções; a interface evita exigir conhecimento sobre skills.

## Critério para avançar

Primeiro, testar a hipótese de uso e a rota oficial de integração. Depois, validar recuperação, exportação, instalação e custo completo. A [demo e os testes](compor/demo-e-testes.md) separam protótipo, integração real, uso independente e pagamento.

O [plano de negócio](compor/negocio-e-gtm.md) define recrutamento, oferta experimental e condições de avanço. A entrega atual contém documentação. Implementação, contato e cobrança exigem outra execução autorizada.

Método: **Revenue-Centric Design, Richard (@richardrx)**, com [termos próprios](debate/2026-10-20-rcd/RCD-LICENSE.txt). A revisão mantém preço, receita e ganho como hipóteses.
