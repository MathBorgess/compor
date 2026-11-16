import { useCallback, useEffect, useState } from 'react';

/** Screen addressed by the URL: `/`, `/projetos/<projectId>` or `/projetos/<projectId>/posts/<pieceId>`. */
export type StudioRoute = { projectId: string | null; pieceId: string | null };

const id = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const projectPath = new RegExp(`^/projetos/${id}(?:/posts/${id})?/?$`);
export const rootRoute: StudioRoute = { projectId: null, pieceId: null };

/** Unknown paths resolve to the project list. */
export function parseStudioPath(pathname: string): StudioRoute {
  const match = projectPath.exec(pathname.toLowerCase());
  return match ? { projectId: match[1], pieceId: match[2] ?? null } : rootRoute;
}

export function studioPath({ projectId, pieceId }: StudioRoute) {
  if (!projectId) return '/';
  return pieceId ? `/projetos/${projectId}/posts/${pieceId}` : `/projetos/${projectId}`;
}

/**
 * Keeps the open project/post in the address bar with the History API, so reload, back/forward and links work.
 * The route stays `undefined` until mounted: the server render has no location and must match the first client render.
 */
export function useStudioRoute() {
  const [route, setRoute] = useState<StudioRoute | undefined>(undefined);
  useEffect(() => {
    const read = () => setRoute(parseStudioPath(window.location.pathname));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const navigate = useCallback((next: StudioRoute, { replace = false } = {}) => {
    const path = studioPath(next);
    if (window.location.pathname !== path) window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(current => current?.projectId === next.projectId && current?.pieceId === next.pieceId ? current : next);
  }, []);
  return [route, navigate] as const;
}
