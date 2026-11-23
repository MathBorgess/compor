/** Canonical UTF-8 JSON for plans, preserving array order and the exact characters of copy. */
export function carouselPlanJson(input: unknown): string {
  return JSON.stringify(input, (_key: string, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const fields = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(fields).sort().map(key => [key, fields[key]]));
  });
}
