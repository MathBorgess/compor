import * as methods from '../../../handlers/api/studio/explorations/route.ts';
import { pagesRoute } from '../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 300 };
export default pagesRoute('/api/studio/explorations', methods);
