import * as methods from '../../../../handlers/api/studio/references/preview/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/api/studio/references/preview', methods);
