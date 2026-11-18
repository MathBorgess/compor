import * as methods from '../../../../handlers/oauth/decision/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/oauth/decision', methods);
