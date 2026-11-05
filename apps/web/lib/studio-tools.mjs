import {
  STUDIO_TOOLS,
  parseStudioAction,
} from "@compor/agents-api/studio-chat-tools";
export { STUDIO_TOOLS };
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** The same command handlers serve native WebMCP and the chat fallback. */
export function createStudioTools({
  getScope,
  handlers,
  confirm = async () => false,
  getReceipt = () => null,
  canRecord = () => true,
  saveReceipt = async (receipt) => receipt.result,
} = {}) {
  if (
    typeof getScope !== "function" ||
    !handlers ||
    typeof confirm !== "function"
  )
    throw TypeError("invalid studio tools");
  const receipts = new Map(),
    registrations = new Set();
  let busy = false,
    disposed = false;
  async function execute(name, input, { signal } = {}) {
    const tool = STUDIO_TOOLS.find((item) => item.name === name);
    if (!tool || disposed || signal?.aborted) throw Error("action_unavailable");
    const args = parseStudioAction(name, input),
      scope = getScope();
    if (
      !uuid(scope?.userId) ||
      !uuid(scope?.projectId) ||
      scope.projectId !== args.projectId
    )
      throw Error("context_unavailable");
    const canonical = JSON.stringify([
      name,
      ...Object.keys(tool.inputSchema.properties)
        .sort()
        .map((key) => [key, args[key]]),
    ]);
    const fingerprint = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonical),
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const receiptKey = `${scope.userId}:${args.projectId}:${args.requestId}`;
    const afterHash=getScope();
    if(disposed||signal?.aborted||afterHash?.userId!==scope.userId||afterHash?.projectId!==scope.projectId)throw Error("context_changed");
    const previous = receipts.get(receiptKey) ?? getReceipt(args.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw Error("action_conflict");
      return { ...previous.result, revision: getScope().revision };
    }
    if (args.revision !== undefined && scope.revision !== args.revision)
      throw Error("context_changed");
    if (busy) throw Error("action_in_progress");
    if (!canRecord(args.requestId)) throw Error("action_receipt_limit");
    async function record(result) {
      receipts.set(receiptKey, { fingerprint, result: { status: "unknown" } });
      const stored = await saveReceipt({
        requestId: args.requestId,
        fingerprint,
        result,
      });
      receipts.set(receiptKey, { fingerprint, result: stored ?? result });
      return stored ?? result;
    }
    const handler = handlers[name];
    if (typeof handler !== "function") throw Error("action_unavailable");
    busy = true;
    try {
      if (
        tool.annotations.consequentialHint &&
        (await confirm({ name, args })) !== true
      ) {
        const result = { status: "declined" };
        return record(result);
      }
      const latest = getScope();
      if (
        disposed ||
        signal?.aborted ||
        latest?.userId !== scope.userId ||
        latest?.projectId !== scope.projectId ||
        (args.revision !== undefined && latest?.revision !== args.revision)
      )
        throw Error("context_changed");
      const reserved=await record({ status: "unknown" });
      const afterReservation=getScope();
      if(disposed||signal?.aborted||afterReservation?.userId!==scope.userId||afterReservation?.projectId!==scope.projectId||afterReservation?.revision!==(reserved.revision??latest.revision))throw Error("context_changed");
      const result = await handler(args, { signal });
      if (
        !result ||
        !["completed", "pending_confirmation", "unknown"].includes(
          result.status,
        )
      )
        throw Error("invalid_action_result");
      return record({ ...result, revision: getScope().revision });
    } finally {
      busy = false;
    }
  }
  function dispose() {
    disposed = true;
    receipts.clear();
    for (const controller of registrations) controller.abort();
    registrations.clear();
  }
  async function register(modelContext) {
    if (!modelContext || typeof modelContext.registerTool !== "function")
      return { native: false, dispose() {} };
    const controller = new AbortController();
    registrations.add(controller);
    try {
      for (const definition of STUDIO_TOOLS) {
        if (disposed || controller.signal.aborted)
          throw Error("action_unavailable");
        await modelContext.registerTool(
          {
            ...definition,
            execute: (args, context) => execute(definition.name, args, context),
          },
          { signal: controller.signal },
        );
      }
      if (disposed) throw Error("action_unavailable");
    } catch {
      controller.abort();
      registrations.delete(controller);
      return { native: false, dispose() {} };
    }
    return {
      native: true,
      dispose: () => {
        controller.abort();
        registrations.delete(controller);
      },
    };
  }
  return { execute, register, dispose, definitions: STUDIO_TOOLS };
}
