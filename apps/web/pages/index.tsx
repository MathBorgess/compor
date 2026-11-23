import type { ComponentProps } from 'react';
import Head from 'next/head';
import Workspace from '../studio/workspace';
import {siteMetadata} from '../lib/entry-content';
import {authConfig} from '../lib/auth-config';
import {localDevelopmentAuth} from '../lib/local-auth';
import {parallelExplorationAvailable} from '../lib/parallel-exploration-availability';
import {selectedVisualsAvailable} from '../lib/selected-visual-availability';

export async function getServerSideProps() {
  const config = authConfig();
  const visualAvailable = selectedVisualsAvailable(Boolean(config));
  return {props:{loginAvailable:Boolean(config),localAuth:Boolean(config && localDevelopmentAuth(config)),developerMode:process.env.NODE_ENV==='development' && process.env.COMPOR_DEVELOPER_MODE==='true',parallelAvailable:parallelExplorationAvailable(Boolean(config)),selectedVisualsAvailable:visualAvailable,selectedVisualsRequired:process.env.COMPOR_SELECTED_LOCAL_VISUALS_ENABLED==='true',referenceAuthorityEnabled:visualAvailable,carouselRenderAvailable:Boolean(config)&&process.env.COMPOR_CAROUSEL_RENDER_ENABLED==='true'&&process.env.COMPOR_PRIVATE_IMAGES_ENABLED==='true'}};
}
export default function Home(props:ComponentProps<typeof Workspace>) {
  return <><Head><title>{siteMetadata.title}</title><meta name="description" content={siteMetadata.description}/><link rel="icon" href={siteMetadata.icon}/></Head><Workspace {...props}/></>;
}
