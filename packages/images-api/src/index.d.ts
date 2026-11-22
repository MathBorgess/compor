export type SupportedImageSize = '1024x1280' | '864x1536';
export declare const SUPPORTED_IMAGE_SIZES: readonly SupportedImageSize[];
type ImageCandidate = Readonly<{
  imageBase64: string;
  mediaType: 'image/png';
  prompt: string;
  requiredText?: readonly string[];
  signal: AbortSignal;
}>;
export type ImageCandidateReview = Readonly<{
  decision: 'approve' | 'reject' | 'unsure';
  findings: ReadonlyArray<Readonly<{
    code: 'visual_integrity' | 'required_text' | 'factual_fidelity' | 'generic_direction';
    region: string;
    evidence: string;
  }>>;
}>;
export type ImageCandidateReviewer = (candidate: ImageCandidate) => Promise<unknown>;
export function createOpenAiImageCandidateReviewer(options: {
  apiKey: string;
  fetch?: typeof fetch;
}): ImageCandidateReviewer;
export function createImageHandler(options: {
  authenticate: (request: Request) => Promise<{ userId: string } | null>;
  fetch?: typeof fetch;
  reviewCandidate?: ImageCandidateReviewer;
}): (request: Request, options?: { authorizeReview?: () => Promise<boolean>; requiredText?: readonly string[] }) => Promise<Response>;
