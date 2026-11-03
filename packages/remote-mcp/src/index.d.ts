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
export function createRemoteMcpHandler(options?: { authenticate?: Authenticate; projectStore?: ProjectStore }): (request: Request) => Promise<Response>;
