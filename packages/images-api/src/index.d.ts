export function createImageHandler(options:{authenticate:(request:Request)=>Promise<{userId:string}|null>;fetch?:typeof fetch}):(request:Request)=>Promise<Response>;
