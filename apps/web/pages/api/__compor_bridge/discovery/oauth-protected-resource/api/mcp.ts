import * as methods from '../../../../../../handlers/.well-known/oauth-protected-resource/api/mcp/route.ts';
import { pagesRoute } from '../../../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/.well-known/oauth-protected-resource/api/mcp', methods);
