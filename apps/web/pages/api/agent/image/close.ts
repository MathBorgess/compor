import * as methods from '../../../../handlers/api/agent/image/close/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/api/agent/image/close', methods);
