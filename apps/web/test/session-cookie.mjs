// A signed-in browser carries the Supabase session cookie for SUPABASE_URL=https://example.supabase.co.
// Without it, proxy.ts answers `/` with the script-free entry instead of the App Router.
export const sessionCookie = origin => ({ name: 'sb-example-auth-token', value: 'fixture', url: origin });
