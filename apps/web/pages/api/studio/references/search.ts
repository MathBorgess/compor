import * as methods from '../../../../handlers/api/studio/references/search/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 15 };
export default pagesRoute('/api/studio/references/search', methods);
