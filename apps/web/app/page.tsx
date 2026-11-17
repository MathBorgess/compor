import Workspace from './workspace';
import { authConfig } from '../lib/supabase.ts';
import { localDevelopmentAuth } from '../lib/local-auth.ts';
import {parallelExplorationAvailable} from '../lib/parallel-exploration-availability.ts';
import {selectedVisualsAvailable} from '../lib/selected-visual-availability.ts';

export const dynamic = 'force-dynamic';
export default function Home() {
  const config = authConfig();
  return <Workspace loginAvailable={Boolean(config)} localAuth={Boolean(config && localDevelopmentAuth(config))} developerMode={process.env.NODE_ENV==='development' && process.env.COMPOR_DEVELOPER_MODE==='true'} parallelAvailable={parallelExplorationAvailable(Boolean(config))} selectedVisualsAvailable={selectedVisualsAvailable(Boolean(config))} selectedVisualsRequired={process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true'} />;
}
