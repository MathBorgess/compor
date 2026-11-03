export interface Principal { userId: string }
export type Authenticate = (token: string) => Promise<Principal | null>;
export function createSupabaseAuthenticator(options: { url: string; anonKey: string; fetchImpl?: typeof fetch }): Authenticate;
export function createRemoteMcpHandler(options?: { authenticate?: Authenticate }): (request: Request) => Promise<Response>;
