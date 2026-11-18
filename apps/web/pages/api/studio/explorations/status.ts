import * as methods from '../../../../handlers/api/studio/explorations/status/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/api/studio/explorations/status', methods);
