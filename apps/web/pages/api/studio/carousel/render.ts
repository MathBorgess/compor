import * as methods from '../../../../handlers/api/studio/carousel/render/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 90 };
export default pagesRoute('/api/studio/carousel/render', methods);
