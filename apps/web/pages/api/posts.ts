import * as methods from '../../handlers/api/posts/route.ts';
import { pagesRoute } from '../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/api/posts', methods);
