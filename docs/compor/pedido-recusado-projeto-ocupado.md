# Pedido recusado por projeto ocupado

Em 5 de novembro de 2026, uma nova solicitação foi recusada com `409 busy`
porque o projeto já tinha uma tentativa ativa. A reserva recusou o novo ID antes
de inserir sua tentativa, medir uso ou chamar a OpenAI. A interface o mantinha
pendente e oferecia consultar um ID que não existia no banco.

O backend agora diferencia essa recusa de um conflito de ID:

```json
{
  "status": "failed",
  "error": "project_busy",
  "failurePhase": "before_submission",
  "requestId": "UUID do pedido novo",
  "retryAutomatically": false
}
```

O HTTP permanece `409`. A interface encerra apenas o ajuste local desse pedido,
preserva sua mensagem e o rascunho e informa que ele não foi enviado à OpenAI.
Não há repetição automática. `conflict`, timeout e resultado desconhecido
continuam pendentes: esses casos não comprovam ausência de envio anterior.
Nenhuma tentativa antiga é encerrada, expirada ou alterada pela correção.

A identificação e recuperação da tentativa que bloqueia o projeto original
continuam pendentes. Devem ser feitas no escopo do proprietário e do projeto,
consultando o mesmo recurso com seu ID verificado. Um resultado incerto não deve
ser transformado em falha por tempo decorrido. Esta correção não adiciona
descoberta de tentativas, acesso administrativo nem nova permissão de banco.

O fluxo completo pode ser validado em um projeto novo e isolado, preservando o
projeto bloqueado para reconciliação. Isso não comprova a recuperação do projeto
original nem encerra as pendências do marco 0. A autorização de teste pago só é
consumida quando o fluxo efetivamente alcançar a chamada ao provedor; a recusa
`busy` não inicia essa chamada.

Os testes verificam a ausência de chamadas ao provedor e à medição, preservação
do registro antigo incerto e ausência de novo registro. No navegador, verificam
que apenas o ajuste novo fica terminal, que o trabalho e a referência anterior
permanecem e que conflito e timeout conservam a pendência, sem ferramentas, ACK,
imagem ou consulta automática.
