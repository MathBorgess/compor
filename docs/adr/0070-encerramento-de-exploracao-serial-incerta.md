# ADR 0070 — Encerramento de exploração serial incerta

**Implementado localmente em 18/11/2026.** Uma exploração serial incerta de um projeto excluído antes da proteção do ADR 0061 permaneceu na trava de geração da conta. Matheus autorizou encerrar essa exploração específica com o resultado original ainda incerto.

## Estado e autoridade

A [migration 41](../../supabase/migrations/20261118000041_close_uncertain_serial_exploration.sql) registra `closed_unknown` e `closed_at` em explorações seriais. Esse estado encerra a espera do Compor e conserva a incerteza sobre a chamada ao fornecedor. A data da última observação, o ID, a posição, o plano e a prova original continuam preservados. A revisão avança para registrar a mudança de estado.

A autorização alcança a exploração indicada. A migration apenas prepara o esquema. O encerramento é uma operação administrativa separada que verifica a identidade da reserva, o escopo da conta, a exclusão do projeto e o estado incerto sob a trava da conta. Nenhum cliente recebe uma permissão de alteração.

As regras de admissão existentes continuam bloqueando `running` e `unknown` em curso. `closed_unknown` libera a trava daquela reserva, preserva a restrição sobre o ID e a posição originais e fica fora das transições de conclusão e recusa. O contrato HTTP serial continua expondo `unknown` como resultado do fornecedor, sem autorizar repetir a solicitação. A verificação de liberação consulta o estado da conta e nunca precisa iniciar uma geração.
