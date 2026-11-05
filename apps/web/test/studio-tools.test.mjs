import test from "node:test";
import assert from "node:assert/strict";
import { createStudioTools } from "../lib/studio-tools.mjs";
const userId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333";
const args = {
  projectId,
  revision: 1,
  requestId,
  field: "offer",
  value: "Curso fictício",
};
test("chat e WebMCP usam o mesmo efeito e repetição não duplica alteração", async () => {
  let calls = 0,
    scope = { userId, projectId, revision: 1 };
  const tools = createStudioTools({
    getScope: () => scope,
    handlers: {
      compor_editar_briefing: async () => {
        calls++;
        scope = { ...scope, revision: 2 };
        return { status: "completed" };
      },
    },
  });
  assert.equal(
    (await tools.execute("compor_editar_briefing", args)).status,
    "completed",
  );
  assert.equal(
    (await tools.execute("compor_editar_briefing", args)).status,
    "completed",
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () => tools.execute("compor_editar_briefing", { ...args, value: "Outro" }),
    /action_conflict/,
  );
  const native = [];
  const registration = await tools.register({
    registerTool: async (d, o) => native.push({ d, o }),
  });
  assert.equal(registration.native, true);
  assert.ok(native.length > 0);
  registration.dispose();
  assert.ok(native.every((t) => t.o.signal.aborted));
});
test("contexto alterado, credencial e schema inesperado são recusados antes do efeito", async () => {
  let calls = 0;
  const tools = createStudioTools({
    getScope: () => ({ userId, projectId, revision: 2 }),
    handlers: {
      compor_editar_briefing: () => {
        calls++;
        return { status: "completed" };
      },
    },
  });
  await assert.rejects(
    () => tools.execute("compor_editar_briefing", args),
    /context_changed/,
  );
  await assert.rejects(
    () =>
      tools.execute("compor_editar_briefing", {
        ...args,
        value: "sk-sensitive-value",
      }),
    /invalid_action/,
  );
  await assert.rejects(
    () =>
      tools.execute("compor_editar_briefing", { ...args, apiKey: "secret" }),
    /invalid_action/,
  );
  assert.equal(calls, 0);
});
test("escrita durável exige confirmação fora dos argumentos do modelo", async () => {
  let writes = 0;
  const tools = createStudioTools({
    getScope: () => ({ userId, projectId, revision: 1 }),
    confirm: async () => false,
    handlers: {
      compor_salvar_versao: async () => {
        writes++;
        return { status: "completed" };
      },
    },
  });
  assert.equal(
    (
      await tools.execute("compor_salvar_versao", {
        projectId,
        revision: 1,
        requestId,
        pieceId: requestId,
        baseVersion: 0,
        expectedLatestVersion: 0,
      })
    ).status,
    "declined",
  );
  assert.equal(writes, 0);
});
test("falha após efeito mantém recibo incerto e não reexecuta na mesma chamada", async () => {
  let writes = 0;
  const tools = createStudioTools({
    getScope: () => ({ userId, projectId, revision: 1 }),
    handlers: {
      compor_editar_briefing: async () => {
        writes++;
        throw Error("interrompido");
      },
    },
  });
  await assert.rejects(() => tools.execute("compor_editar_briefing", args));
  assert.equal(
    (await tools.execute("compor_editar_briefing", args)).status,
    "unknown",
  );
  assert.equal(writes, 1);
});
test("aprovação não permite executar no projeto que ficou inativo", async () => {
  let scope = { userId, projectId, revision: 1 },
    calls = 0;
  const tools = createStudioTools({
    getScope: () => scope,
    confirm: async () => {
      scope = { ...scope, revision: 2 };
      return true;
    },
    handlers: {
      compor_salvar_versao: async () => {
        calls++;
        return { status: "completed" };
      },
    },
  });
  await assert.rejects(
    () =>
      tools.execute("compor_salvar_versao", {
        projectId,
        revision: 1,
        requestId,
        pieceId: requestId,
        baseVersion: 0,
        expectedLatestVersion: 0,
      }),
    /context_changed/,
  );
  assert.equal(calls, 0);
});
test("recibo persistido impede duplicar efeito após recriar o executor com revisão mais nova", async () => {
  const persisted = new Map();
  let calls = 0, revision = 1;
  const make = () => createStudioTools({
    getScope: () => ({userId,projectId,revision}),
    getReceipt: id => persisted.get(id),
    saveReceipt: async receipt => {persisted.set(receipt.requestId,structuredClone(receipt));return receipt.result;},
    handlers: {compor_editar_briefing: async () => {calls++;revision++;return {status:'completed',local:true};}},
  });
  const first = make();await first.execute('compor_editar_briefing',args);first.dispose();
  const restored = make();assert.equal((await restored.execute('compor_editar_briefing',args)).status,'completed');assert.equal(calls,1);assert.equal(revision,2);
  await assert.rejects(()=>restored.execute('compor_editar_briefing',{...args,value:'Outra oferta'}),/action_conflict/);
  restored.dispose();
});
test("recibo incerto sobrevive à recriação sem repetir o handler interrompido", async () => {
  const persisted = new Map();let calls = 0;
  const make = () => createStudioTools({
    getScope: () => ({userId,projectId,revision:1}),getReceipt:id=>persisted.get(id),
    saveReceipt:async receipt=>{persisted.set(receipt.requestId,structuredClone(receipt));return receipt.result;},
    handlers:{compor_editar_briefing:async()=>{calls++;throw Error('interrompido');}},
  });
  const first=make();await assert.rejects(()=>first.execute('compor_editar_briefing',args));first.dispose();
  const restored=make();assert.equal((await restored.execute('compor_editar_briefing',args)).status,'unknown');assert.equal(calls,1);restored.dispose();
});
test("dispose durante registro nativo pendente aborta o registro e seus executores", async () => {
  let release,arrive;const entered=new Promise(resolve=>{arrive=resolve;}),gate=new Promise(resolve=>{release=resolve;});const registrations=[];
  const tools=createStudioTools({getScope:()=>({userId,projectId,revision:1}),handlers:{compor_editar_briefing:async()=>({status:'completed'})}});
  const pending=tools.register({registerTool:async(definition,options)=>{registrations.push({definition,options});arrive();await gate;}});
  await entered;tools.dispose();release();assert.equal((await pending).native,false);assert.equal(registrations.length,1);assert.equal(registrations[0].options.signal.aborted,true);
  await assert.rejects(()=>registrations[0].definition.execute(args),/action_unavailable/);
});

test("persistir o recibo não autoriza agir depois de perder ou trocar a identidade", async (t) => {
  for (const nextUserId of [null, "44444444-4444-4444-8444-444444444444"]) {
    await t.test(nextUserId === null ? "revalidação em andamento" : "outra conta", async () => {
      let scope = { userId, projectId, revision: 1 }, calls = 0, release, entered;
      const writing = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const tools = createStudioTools({
        getScope: () => scope,
        saveReceipt: async receipt => {
          scope = { ...scope, revision: scope.revision + 1 };
          const result = { ...receipt.result, revision: scope.revision };
          if (receipt.result.status === "unknown") { entered(); await gate; }
          return result;
        },
        handlers: { compor_editar_briefing: async () => { calls++; return { status: "completed" }; } },
      });
      const executing = tools.execute("compor_editar_briefing", args);
      await writing;
      scope = { ...scope, userId: nextUserId };
      release();
      await assert.rejects(executing, /context_changed/);
      assert.equal(calls, 0, "no domain effect occurs after the identity boundary changes");
      tools.dispose();
    });
  }
});

test("repetição com recibo não divulga o resultado se a identidade muda durante o hash", async () => {
  let scope = { userId, projectId, revision: 1 }, calls = 0;
  const tools = createStudioTools({
    getScope: () => scope,
    handlers: { compor_editar_briefing: async () => { calls++; return { status: "completed" }; } },
  });
  await tools.execute("compor_editar_briefing", args);
  const repeating = tools.execute("compor_editar_briefing", args);
  scope = { ...scope, userId: null };
  await assert.rejects(repeating, /context_changed/);
  assert.equal(calls, 1);
  tools.dispose();
});
