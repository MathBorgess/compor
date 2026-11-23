export interface PrivateImageOptions {
  appOrigin: string;
  supabaseUrl: string;
  publishableKey: string;
  authenticate: (request: Request) => Promise<{userId: string; token: string} | null>;
  fetch?: typeof fetch;
  validateCarouselJpeg?: (bytes: Uint8Array) => Promise<boolean>;
  allowCarouselJpegUploads?: boolean;
}
export function createPrivateImageHandler(options:PrivateImageOptions):(request:Request)=>Promise<Response>;
