import type {PrivateImageOptions} from './index.js';
export function createPrivateImageListingHandler(options:Omit<PrivateImageOptions,'appOrigin'>):(request:Request)=>Promise<Response>;
