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
export interface CreativeField { id: string; label: string; value: string; origin: 'user' | 'agent' }
export interface PieceContent { headline: string; price: string; date: string; caption: string; captionOrigin: 'user' | 'agent'; fields?: CreativeField[] }
export interface PieceVersion { project_id: string; piece_id: string; version: number; content: PieceContent; created_at: string }
export interface PieceIdentity { projectId: string; pieceId: string }
export interface PieceSummary { pieceId: string; latestVersion: number; headline: string; createdAt: string }
export interface PieceStore {
  listPieces?(context: ProjectContext, input: { projectId: string; after?: string }): Promise<{ pieces: PieceSummary[]; nextCursor: string | null }>;
  save(context: ProjectContext, input: PieceIdentity & { expectedVersion: number; content: PieceContent }): Promise<{ status: 'saved'; version: PieceVersion } | { status: 'conflict'; currentVersion: number } | { status: 'not_found' }>;
  list(context: ProjectContext, input: PieceIdentity): Promise<PieceVersion[]>;
}
export function createSupabasePieceStore(options: { url: string; anonKey: string; fetchImpl?: typeof fetch }): PieceStore;
export type ExplorationInput = {projectId:string;requestId:string;prompt:string};
export type ExplorationResult = {status:'completed';requestId:string;imageId:string} | {status:'running'|'unknown'|'busy'|'blocked'|'awaiting_feedback';requestId:string;retryAutomatically:false};
export function createRemoteMcpHandler(options?: { authenticate?: Authenticate; projectStore?: ProjectStore; pieceStore?: PieceStore; exploration?:(context:ProjectContext,input:ExplorationInput,key:string)=>Promise<ExplorationResult>; explorationRead?:(context:ProjectContext,input:{projectId:string;imageId:string})=>Promise<Uint8Array>; explorationResume?:(context:ProjectContext,input:{projectId:string})=>Promise<'resumed'|'not_paused'|'blocked'> }): (request: Request) => Promise<Response>;
