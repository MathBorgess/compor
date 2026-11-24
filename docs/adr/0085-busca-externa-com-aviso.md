# ADR 0085 — Busca externa com aviso

- Estado: implementação local em validação
- Data: 23/11/2026
- Fonte: decisão de Matheus na revisão do preview local da bancada de referências.

Ao abrir a bancada, a busca no Pinterest e o carregamento de prévias são permitidos automaticamente para a sessão da conta. A interface informa isso, sem exigir o botão “Permitir nesta sessão”. A busca sugerida pode começar ao abrir a bancada quando houver uma ideia; a busca manual continua disponível. A permissão é renovada para a conta autenticada na tela, inclusive após troca de conta ou sessão. Se sessionStorage estiver indisponível, a busca continua disponível enquanto a tela estiver aberta.

Esta decisão substitui somente a exigência de consentimento prévio para busca e prévias do [ADR 0037](0037-referencias-sugeridas-e-retorno-ao-post.md). A seleção de uma sugestão continua sendo uma ação da pessoa. O envio das referências externas escolhidas para geração mantém o consentimento e os controles de autoridade próprios do [ADR 0067](0067-autoridade-de-referencias-com-cas.md); autorizar a busca não autoriza geração nem cria capacidade de geração automaticamente.

Os testes locais simulam Pinterest e os serviços de autorização. Eles não comprovam o comportamento do fornecedor externo nem geração real.
