import Workspace from './workspace';
import { authConfig } from '../lib/supabase.ts';
import { localDevelopmentAuth } from '../lib/local-auth.ts';

export const dynamic = 'force-dynamic';
export default function Home() {
  const config = authConfig();
  return <Workspace loginAvailable={Boolean(config)} localAuth={Boolean(config && localDevelopmentAuth(config))} legacy={process.env.COMPOR_STUDIO_WEB_ENABLED==='false'} developerMode={process.env.NODE_ENV==='development' && process.env.COMPOR_DEVELOPER_MODE==='true'} />;
}
