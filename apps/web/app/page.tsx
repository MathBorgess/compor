import Workspace from './workspace';
import { authConfig } from '../lib/supabase.ts';

export const dynamic = 'force-dynamic';
export default function Home() {
  return <Workspace loginAvailable={Boolean(authConfig())} legacy={process.env.COMPOR_STUDIO_WEB_ENABLED==='false'} />;
}
