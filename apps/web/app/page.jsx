import Workspace from './workspace';
import { authConfig } from '../lib/supabase';

export const dynamic = 'force-dynamic';
export default function Home() {
  return <Workspace loginAvailable={Boolean(authConfig())} />;
}
