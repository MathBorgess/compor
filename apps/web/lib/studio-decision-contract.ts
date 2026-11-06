export const studioDecisionIds = ["layout-b", "layout-c", "bases", "marca", "ver-arte", "baixar", "produto", "persona", "objetivo", "personalidade"] as const;
export type StudioDecisionId = typeof studioDecisionIds[number];
export interface StudioDecisionInput {
  decision: StudioDecisionId;
  projectId: string;
  briefing?: string;
  title?: string;
}
export interface ExplorationReference {
  id: string;
  board: string;
  description: string;
  originKind: "synthetic";
}
export interface ReferenceSummary {
  mode: "deterministic_mock";
  sourceCatalog: "compor_phoenix_static";
  label: string;
  references: ExplorationReference[];
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
/** Browser-safe response boundary; no server runtime or large schema package enters the client. */
export const referenceSummarySchema = {
  parse(value: unknown): ReferenceSummary {
    if (!object(value) || !exactKeys(value, ["mode", "sourceCatalog", "label", "references"]) ||
        value.mode !== "deterministic_mock" || value.sourceCatalog !== "compor_phoenix_static" ||
        !bounded(value.label, 200) || !Array.isArray(value.references) || value.references.length > 4) throw new Error("Exploração inválida");
    const references: ExplorationReference[] = value.references.map((item: unknown) => {
      if (!object(item) || !exactKeys(item, ["id", "board", "description", "originKind"]) ||
          !bounded(item.id, 80) || !bounded(item.board, 120) || !bounded(item.description, 400) ||
          item.originKind !== "synthetic") throw new Error("Referência inválida");
      return { id: item.id, board: item.board, description: item.description, originKind: item.originKind };
    });
    return { mode: value.mode, sourceCatalog: value.sourceCatalog, label: value.label, references };
  },
  safeParse(value: unknown): { success: true; data: ReferenceSummary } | { success: false; error: Error } {
    try { return { success: true, data: this.parse(value) }; }
    catch { return { success: false, error: new Error("Exploração inválida") }; }
  },
};
