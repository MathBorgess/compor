import * as methods from '../../../../handlers/auth/sign-out/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/auth/sign-out', methods);
