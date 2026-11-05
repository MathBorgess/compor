import Workspace from './workspace';
import LegacyWorkspace from './legacy-workspace';
import { authConfig } from '../lib/supabase.ts';

export const dynamic = 'force-dynamic';
export default function Home() {
  const ActiveWorkspace=process.env.COMPOR_STUDIO_WEB_ENABLED==='false'?LegacyWorkspace:Workspace;
  return <ActiveWorkspace loginAvailable={Boolean(authConfig())} />;
}
