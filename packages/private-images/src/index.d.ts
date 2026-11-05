export interface PrivateImageOptions {appOrigin:string;supabaseUrl:string;publishableKey:string;authenticate:(request:Request)=>Promise<{userId:string;token:string}|null>;fetch?:typeof fetch}
export function createPrivateImageHandler(options:PrivateImageOptions):(request:Request)=>Promise<Response>;
