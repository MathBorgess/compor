export interface Principal { userId: string }
export type Authenticate = (token: string) => Promise<Principal | null>;
export function createSupabaseAuthenticator(options: { url: string; anonKey: string; fetchImpl?: typeof fetch }): Authenticate;
export interface Project { id: string; title: string; created_at: string }
export interface ProjectContext { actor: Principal; token: string }
export interface ProjectStore {
  create(context: ProjectContext, title: string): Promise<Project>;
  list(context: ProjectContext): Promise<Project[]>;
}
export function createSupabaseProjectStore(options: { url: string; anonKey: string; fetchImpl?: typeof fetch }): ProjectStore;
export interface PieceContent { headline: string; price: string; date: string; caption: string; captionOrigin: 'user' | 'agent' }
export interface PieceVersion { project_id: string; piece_id: string; version: number; content: PieceContent; created_at: string }
export interface PieceIdentity { projectId: string; pieceId: string }
export interface PieceStore {
  save(context: ProjectContext, input: PieceIdentity & { expectedVersion: number; content: PieceContent }): Promise<{ status: 'saved'; version: PieceVersion } | { status: 'conflict'; currentVersion: number } | { status: 'not_found' }>;
  list(context: ProjectContext, input: PieceIdentity): Promise<PieceVersion[]>;
}
export function createSupabasePieceStore(options: { url: string; anonKey: string; fetchImpl?: typeof fetch }): PieceStore;
export function createRemoteMcpHandler(options?: { authenticate?: Authenticate; projectStore?: ProjectStore; pieceStore?: PieceStore }): (request: Request) => Promise<Response>;
