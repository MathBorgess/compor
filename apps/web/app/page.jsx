import Workspace from './workspace';
import LegacyWorkspace from './legacy-workspace';
import { authConfig } from '../lib/supabase';

export const dynamic = 'force-dynamic';
export default function Home() {
  const ActiveWorkspace=process.env.COMPOR_STUDIO_WEB_ENABLED==='true'?Workspace:LegacyWorkspace;
  return <ActiveWorkspace loginAvailable={Boolean(authConfig())} />;
}
