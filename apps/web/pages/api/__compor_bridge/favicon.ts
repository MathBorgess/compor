import * as methods from '../../../handlers/favicon.ico/route.ts';
import { pagesRoute } from '../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/favicon.ico', methods);
