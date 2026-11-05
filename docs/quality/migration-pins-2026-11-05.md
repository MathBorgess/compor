# Leitura reprodutível das migrações revisadas

Em 05/11/2026, o [job Contracts and data isolation](https://github.com/MathBorgess/compor/actions/runs/42129166916/job/127601145749) falhou em cinco suítes porque o commit histórico `1feceb7531d80cee9a9547d198c1ff218779a700` não estava publicado. O checkout tinha histórico completo, mas os seis commits originais pertenciam a branches locais. Os mesmos blobs haviam sido integrados a `main` com outros IDs.

Os preparos agora leem commits publicados fixos em `READ_COMMIT`. `SOURCE_COMMIT` e a lista `SOURCES` continuam identificando as revisões históricas nas linhas de auditoria e no JSON de preparação. Nenhuma migração, política, guarda, hash ou instrução SQL foi alterada. Não há fallback para `HEAD` ou para arquivos da árvore de trabalho.

| Preparo | Commit fixo de leitura |
| --- | --- |
| Imagem 2.6 | `46c5a85c948ec49b7b2916ee5fb8e880ceb8c9a1` |
| Recuperação | `04d986b479f588afe3fcad85b0cabe958d5352a7` |
| Duas migrações do estúdio | `7a3d50a4cd3f289b84c3e502d80e3a199e37ef87` |
| Medição v3 | `cbb1e027bfec06783c13da51f2c38e6dc4ee8ca0` |
| IDs do fornecedor | `03a13b815df4fb8c3ad551f1891efdf68f0b9d60` |

## Integridade das saídas

Os SHA-256 abaixo foram calculados antes da correção, a partir dos preparos de `626a34875c6592acf3f7192ce99fbce262693461` com os commits históricos disponíveis. O [teste de regressão](../../scripts/test_prepare_migration_sources.py) exige esses mesmos valores depois da correção, em outro repositório Git criado exclusivamente com o histórico alcançável por `HEAD`, sem alternates ou acesso aos seis commits históricos.

| Saída | SHA-256 preservado |
| --- | --- |
| Imagem: aplicação | `6d554ba336473d1f7990c5036ebc26e9a22ae0042225e4e3572ad202f820a705` |
| Recuperação: aplicação | `983fa9666dcc3e22ab55b205702e7ddcae888dfec5e0778fb740650a0379ed47` |
| Estúdio: aplicação | `d41efb00648082e6303127f4583388433c9d6d786992fe373707531a26012f08` |
| Estúdio: prova | `255f27767f57c38eb230cab820937d30246c6776eb43a1793c6b8b41316fa8fc` |
| Medição v3: aplicação | `11029e55dc7ceb62704cfa6972ed8d30c158d8c0d851a83db9bd8b809e33505c` |
| Medição v3: prova | `940527cd64bb9a6bf6f2987e5e72df5dc570545f619136aaef1489e07f67bac5` |
| IDs do fornecedor: aplicação | `fe7834d90ae8384823afe1d296f13b5934a52812dbc7487cf77c6f1b8b4082a4` |
| IDs do fornecedor: prova | `bfbdc0b91713b30410fcaa09b1dbc8d42f84899362679cd515f6f65aa9e13200` |

O teste reproduziu a falha original e passou após a separação. Essa comparação cobre todo o SQL gerado, incluindo as linhas de auditoria. Os testes executam bancos locais de fixture; nenhum SQL foi aplicado ao Supabase remoto nesta correção.

`npm run quality:unit` também passou em checkout separado, criado por Git bundle de `626a348`, com os scripts corrigidos copiados e instalações limpas dos cinco pacotes usados pelo job: 392 testes Node e nove testes Python, sem falhas ou skips. Ambiente: macOS, Node 24.16.0, npm 11.13.0, Python 3.12 e `psql` 17.1. O resultado Linux da correção depende de uma nova execução do workflow.
