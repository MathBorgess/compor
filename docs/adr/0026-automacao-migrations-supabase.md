# ADR 0026 — Automação de migrations do Supabase

- Estado: recorded
- Data: 06/11/2026
- Contexto: pedido de Matheus para aplicar migrations pelo GitHub Actions após alterações na `main`.

## Decisão

A proposta de CLI e trava abaixo foi posteriormente modificada pelo [ADR 0027](0027-trava-automacao-migrations.md); este registro preserva o estado anterior.

Um workflow separado do Quality foi preparado para push à `main` que altera `supabase/migrations/` e execução manual apenas para `main`, mas permanece incondicionalmente bloqueado antes de conectar. Falta uma trava durável para impedir que uma execução enfileirada tente novamente após falha ou cancelamento de resultado incerto. O job proposto usa token GitHub somente de leitura, ações e versão do Supabase CLI fixadas e ambiente `production`. `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` seriam secrets do ambiente; `SUPABASE_PROJECT_REF`, `SUPABASE_MIGRATIONS_VERIFIED_PROJECT_REF` e `SUPABASE_MIGRATIONS_ENABLED` seriam variáveis de repositório. As duas referências devem coincidir, sem que isso comprove a identidade. A senha e o token são carregados apenas na etapa do CLI, não em argumentos ou logs intencionais. `PGSSLMODE=verify-full` e a CA pública com fingerprint já fixado nos scripts protegem o canal do banco, inclusive o vínculo; um único certificado é convertido em arquivo temporário privado e removido após a etapa. A origem é [Supabase CLI v2.84.2](https://github.com/supabase/cli/blob/v2.84.2/internal/gen/types/templates/prod-ca-2021.crt), e sua substituição exige revisão de fingerprint e confiança do destino.

A falha ocorre antes da etapa com credenciais e conexão, mesmo que a variável de habilitação seja `true`. A fila compartilhada serializa execuções e não cancela as que estão aplicando, mas isso **não** impede uma execução enfileirada de iniciar após falha ou cancelamento. Uma futura trava deve resolver esse caso antes de remover a interrupção. Depois de entrar na fila cada job obteria a `main` atual, e uma execução manual poderia cobrir migrations pendentes sem push de arquivo.

O CLI fixado 2.84.2 rejeita opções desconhecidas no `supabase/config.toml` atual. O trecho proposto cria um diretório temporário com cópia idêntica dos arquivos de migration, rejeita links simbólicos, e usa configuração mínima com migrations habilitadas; não copia seeds, roles, Vault ou outras opções do arquivo do repositório. Isso significa que também ignoraria `db.migrations.enabled = false` e quaisquer ajustes futuros naquele arquivo. Antes de tornar o fluxo executável, revise se essa semântica continua apropriada e prove em projeto isolado as migrations e seu histórico; o teste TLS local não é ensaio de aplicação nem prova equivalência de configuração.

## Segurança e implantação

O histórico CLI e `compor_migration_audit.applied` não são equivalentes. A variável de habilitação não verifica o banco, a identidade ou seu esquema. Antes de habilitar, o operador deve identificar e verificar o destino, comparar históricos e conteúdo efetivo, reconciliar incompatibilidades por plano revisado, fazer backup e ensaiar a aplicação e a reversão em ambiente isolado. O workflow não usa `migration repair`, `--include-all` ou baseline automático. Isso preserva o contrato dos preparos históricos, que exigem inspeção diante de divergência; não substitui a coordenação para a migração 25 no ADR 0025.

Um push pode disparar a Vercel em paralelo; não existe dependência entre o deploy de aplicação e o término da migration. Migrations incompatíveis, alterações durante operações em voo, drift manual e falhas parciais exigem plano específico. Uma falha ou perda de confirmação não autoriza repetição sem inspeção. Aprovar este ADR e configurar secrets não equivale a provar compatibilidade do projeto real nem concede autorização para criar credenciais ou executar alterações em produção.
