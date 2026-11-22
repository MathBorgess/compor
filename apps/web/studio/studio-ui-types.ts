import * as z from '../lib/schema.ts';
import type { PieceContent, StudioDraft } from '../lib/studio-domain';
export type { PieceVersion } from '../lib/studio-piece-contract';

export const projectSchema = z.object({ id: z.string(), title: z.string(), revision:z.optional(z.number()), created_at: z.optional(z.string()) });
export const projectsSchema = z.object({ projects: z.array(projectSchema) });
export const projectResponseSchema = z.object({ project: projectSchema });
export const markerSchema = z.object({ assetId: z.nullable(z.string()) });
export const storedImageSchema = z.object({ status: z.string(), assetId: z.optional(z.string()) });
export type Project = z.infer<typeof projectSchema>;
export type Content = PieceContent;
export type ImageSelection = { blob: Blob; pieceId: string; version: number; frameId?: string; assetId?: string; creationContext?: NonNullable<StudioDraft['creationContext']> };
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
