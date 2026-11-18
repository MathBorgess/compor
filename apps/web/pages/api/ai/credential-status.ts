import * as methods from '../../../handlers/api/ai/credential-status/route.ts';
import { pagesRoute } from '../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/api/ai/credential-status', methods);
