# Snapshot recuperado de C1

`server-c1.ts` foi reconstruído revertendo somente as duas mudanças de contrato C2 em uma cópia da fonte. O arquivo resultante tem **exatamente** o SHA-256 registrado em `../candidate.json`; a compilação com TypeScript 5.9.3 produziu `server-c1.js` com o hash exato do build C1 registrado. Não se trata de uma aproximação do código, e os arquivos atuais de C2 não foram alterados.

- Fonte C1: `91b19828706b806c4097bd6481ee59fbe8e46ac9ec4487baf65210980ef8068f`
- Build C1: `24b131240f0ca571abb638f787b60567fe280ae52d53f0c6d56d876990f7df9b`

A recuperação foi verificada por hash, sem executar novos testes ou sessões. Método e limites estão em `restoration.json`.

Para reproduzir uma sessão, use um checkout isolado com as dependências, skills e harness registrados no experimento. Copie o snapshot de fonte para `src/server.ts`, compile e confira o hash de `dist/server.js`; alternativamente, coloque o build preservado nessa mesma localização. Não importe diretamente `server-c1.js` desta pasta: a resolução relativa do catálogo de skills espera a localização original do runtime.

Esses dois arquivos identificam o servidor C1, mas não substituem o registro de versões das demais partes do experimento. Os arquivos `baseline.json` e `candidate.json` não foram modificados.
