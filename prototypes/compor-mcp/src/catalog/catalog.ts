import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const CATALOG_RESOURCE_URI = 'compor://catalog/sources';

export const catalogSourceSchema = z.strictObject({
  source_id: z.string().trim().min(1).max(80).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(1).max(160),
  domain: z.string().trim().min(1).max(120),
  allowed_boards_or_queries: z.array(z.string().trim().min(1).max(200)).min(1),
  access_method: z.enum(['api_official', 'curated_board_http']),
  license_default: z.literal('inspiration_only'),
  cost_tier: z.string().trim().min(1).max(60),
  rate_limit: z.strictObject({
    requests_per_minute: z.number().int().positive(),
    timeout_ms: z.number().int().positive().max(5000),
  }),
  active: z.boolean(),
});

export const sourcesCatalogSchema = z.strictObject({
  catalog_version: z.string().trim().min(1).max(40),
  uri: z.literal(CATALOG_RESOURCE_URI),
  description: z.string().trim().min(1).max(500),
  policy: z.strictObject({
    headless_browser_allowed: z.literal(false),
    download_on_search_allowed: z.literal(false),
    require_explicit_user_consent: z.literal(true),
    default_license_scope: z.literal('inspiration_only'),
  }),
  sources: z.array(catalogSourceSchema).min(1),
});

export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type SourcesCatalog = z.infer<typeof sourcesCatalogSchema>;

function resolveCatalogPath(): string {
  const sameDir = fileURLToPath(new URL('./sources_catalog.json', import.meta.url));
  if (existsSync(sameDir)) return sameDir;
  return fileURLToPath(new URL('../../src/catalog/sources_catalog.json', import.meta.url));
}

export async function loadSourcesCatalog(): Promise<SourcesCatalog> {
  const raw = await readFile(resolveCatalogPath(), 'utf8');
  return sourcesCatalogSchema.parse(JSON.parse(raw));
}

export type SourceGovernanceResult =
  | {
      allowed: true;
      sources: CatalogSource[];
    }
  | {
      allowed: false;
      code: 'consent_required' | 'source_not_in_catalog' | 'source_inactive';
      message: string;
      blocked_source_ids: string[];
    };

export async function validateSourceGovernance(options: {
  consent_external_search: boolean;
  source_ids?: string[];
  catalog?: SourcesCatalog;
}): Promise<SourceGovernanceResult> {
  if (options.consent_external_search !== true) {
    return {
      allowed: false,
      code: 'consent_required',
      message: 'Busca externa bloqueada: consent_external_search deve ser explicitamente true.',
      blocked_source_ids: options.source_ids ?? [],
    };
  }

  const catalog = options.catalog ?? (await loadSourcesCatalog());
  const byId = new Map<string, CatalogSource>(catalog.sources.map((s) => [s.source_id, s]));

  const requested = options.source_ids?.filter((id) => id.trim().length > 0) ?? [];
  if (requested.length === 0) {
    const activeSources = catalog.sources.filter((s) => s.active);
    return { allowed: true, sources: activeSources };
  }

  const unknownIds: string[] = [];
  const inactiveIds: string[] = [];
  const approved: CatalogSource[] = [];

  for (const id of requested) {
    const source = byId.get(id);
    if (!source) {
      unknownIds.push(id);
      continue;
    }
    if (!source.active) {
      inactiveIds.push(id);
      continue;
    }
    approved.push(source);
  }

  if (unknownIds.length > 0) {
    return {
      allowed: false,
      code: 'source_not_in_catalog',
      message: `Busca externa bloqueada: fonte(s) fora do catálogo ${CATALOG_RESOURCE_URI}: ${unknownIds.join(', ')}.`,
      blocked_source_ids: unknownIds,
    };
  }

  if (inactiveIds.length > 0) {
    return {
      allowed: false,
      code: 'source_inactive',
      message: `Busca externa bloqueada: fonte(s) inativa(s) em ${CATALOG_RESOURCE_URI}: ${inactiveIds.join(', ')}.`,
      blocked_source_ids: inactiveIds,
    };
  }

  return { allowed: true, sources: approved };
}
