import * as methods from '../../../../handlers/auth/sign-in/route.ts';
import { pagesRoute } from '../../../../lib/pages-route-adapter.ts';

export const config = { api: { bodyParser: false, responseLimit: false } };
export default pagesRoute('/auth/sign-in', methods);
