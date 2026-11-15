import type {ActionInputByName,StudioActionName,StudioAction,StudioTool} from '@compor/agents-api/studio-chat-tools';
import type {ActionResult,ActionReceipt} from './studio-domain.ts';
export type StudioHandlers = {[Name in StudioActionName]?: (input:ActionInputByName[Name],context:{signal?:AbortSignal;conversationId?:string})=>ActionResult|Promise<ActionResult>};
export interface StudioModelContext {registerTool:(tool:StudioTool & {execute:(input:unknown,context:{signal?:AbortSignal;conversationId?:string})=>Promise<ActionResult>},options:{signal:AbortSignal})=>unknown|Promise<unknown>}
interface StudioToolsOptions {getScope?:()=>{userId:string|null;projectId:string;revision:number}|null;handlers?:StudioHandlers;confirm?:(action:{name:StudioActionName;args:StudioAction})=>Promise<boolean>;getReceipt?:(requestId:string)=>ActionReceipt|null|undefined;canRecord?:(requestId:string)=>boolean;saveReceipt?:(receipt:ActionReceipt)=>Promise<ActionResult|void>}
import {
  STUDIO_TOOLS,
  parseStudioAction,
} from "@compor/agents-api/studio-chat-tools";
export { STUDIO_TOOLS };
const uuid = (value:unknown):value is string =>
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
}:StudioToolsOptions = {}) {
  if (
    typeof getScope !== "function" ||
    !handlers ||
    typeof confirm !== "function"
  )
    throw TypeError("invalid studio tools");
  const getCurrentScope=getScope,commandHandlers=handlers;
  function readScope(){const scope=getCurrentScope();if(!scope)throw Error("context_changed");return scope;}
  const receipts = new Map<string,Pick<ActionReceipt,"fingerprint"|"result">>(),
    registrations = new Set<AbortController>();
  let busy = false,
    disposed = false;
  async function execute(name:string, input:unknown, options:{signal?:AbortSignal;conversationId?:string} = {}):Promise<ActionResult> {
    const definition=STUDIO_TOOLS.find(tool=>tool.name===name);
    if(!definition)throw Error("action_unavailable");
    return executeNamed(definition.name,input,options);
  }
  async function executeNamed<Name extends StudioActionName>(name:Name, input:unknown, { signal,conversationId }:{signal?:AbortSignal;conversationId?:string} = {}):Promise<ActionResult> {
    const tool = STUDIO_TOOLS.find((item) => item.name === name);
    if (!tool || disposed || signal?.aborted) throw Error("action_unavailable");
    const args = parseStudioAction(name, input),
      scope = readScope();
    if (
      !scope || !uuid(scope.userId) ||
      !uuid(scope?.projectId) ||
      scope.projectId !== args.projectId
    )
      throw Error("context_unavailable");
    const canonical = JSON.stringify([
      name,...(conversationId?[conversationId]:[]),
      ...Object.keys(tool.inputSchema.properties)
        .sort()
        .map((key) => [key, Reflect.get(args,key)]),
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
    const afterHash=readScope();
    if(disposed||signal?.aborted||afterHash?.userId!==scope.userId||afterHash?.projectId!==scope.projectId)throw Error("context_changed");
    const previous = receipts.get(receiptKey) ?? getReceipt(args.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw Error("action_conflict");
      return { ...previous.result, revision: readScope().revision };
    }
    if (args.revision !== undefined && scope.revision !== args.revision)
      throw Error("context_changed");
    if (busy) throw Error("action_in_progress");
    if (!canRecord(args.requestId)) throw Error("action_receipt_limit");
    async function record(result:ActionResult) {
      receipts.set(receiptKey, { fingerprint, result: { status: "unknown" } });
      const stored = await saveReceipt({
        requestId: args.requestId,
        fingerprint,
        result,
      });
      receipts.set(receiptKey, { fingerprint, result: stored ?? result });
      return stored ?? result;
    }
    const handler = commandHandlers[name];
    if (typeof handler !== "function") throw Error("action_unavailable");
    busy = true;
    try {
      if (
        tool.annotations.consequentialHint &&
        (await confirm({ name, args })) !== true
      ) {
        const result:ActionResult = { status: "declined" };
        return record(result);
      }
      const latest = readScope();
      if (
        disposed ||
        signal?.aborted ||
        latest?.userId !== scope.userId ||
        latest?.projectId !== scope.projectId ||
        (args.revision !== undefined && latest?.revision !== args.revision)
      )
        throw Error("context_changed");
      const reserved=await record({ status: "unknown" });
      const afterReservation=readScope();
      if(disposed||signal?.aborted||afterReservation?.userId!==scope.userId||afterReservation?.projectId!==scope.projectId||afterReservation?.revision!==(reserved.revision??latest.revision))throw Error("context_changed");
      const result = await handler(args, { signal,conversationId });
      if (
        !result ||
        !["completed", "declined", "pending_confirmation", "unknown"].includes(
          result.status,
        )
      )
        throw Error("invalid_action_result");
      return record({ ...result, revision: readScope().revision });
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
  async function register(modelContext:StudioModelContext|undefined|null) {
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
