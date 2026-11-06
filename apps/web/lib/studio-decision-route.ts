import type { Actor } from "./agent-auth.ts";
import { calibrateDecision, studioDecisionInputSchema } from "./phoenix-worker.ts";
import type { StudioDecisionInput } from "./studio-decision-contract.ts";

const MAX_BODY_BYTES = 8192;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function boundedBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new Error("body too large");
  if (!request.body) throw new Error("missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("body too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

interface Dependencies {
  appOrigin: string;
  resolveActor: () => Promise<Actor | null>;
  ownsProject: (actor: Actor, projectId: string) => Promise<boolean>;
  evaluate?: (input: StudioDecisionInput) => ReturnType<typeof calibrateDecision>;
}

export function createStudioDecisionRoute({ appOrigin, resolveActor, ownsProject, evaluate = calibrateDecision }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.headers.get("origin") !== appOrigin) return reply({ error: "invalid_origin" }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return reply({ error: "invalid_request" }, 400);
    let actor: Actor | null;
    try { actor = await resolveActor(); }
    catch { return reply({ error: "unavailable" }, 503); }
    if (!actor?.userId || !actor.token) return reply({ error: "unauthorized" }, 401);
    let input: StudioDecisionInput;
    try { input = studioDecisionInputSchema.parse(JSON.parse(await boundedBody(request))); }
    catch { return reply({ error: "invalid_request" }, 400); }
    try {
      if (!await ownsProject(actor, input.projectId)) return reply({ error: "not_found" }, 404);
      return reply(evaluate(input));
    } catch { return reply({ error: "unavailable" }, 503); }
  };
}
