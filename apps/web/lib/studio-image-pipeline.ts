import { createImageHandler, createOpenAiImageCandidateReviewer } from '@compor/images-api';

type Authenticate = Parameters<typeof createImageHandler>[0]['authenticate'];

/** Server configuration. Null means generation is unavailable, while reads can continue. */
export function studioImagePipeline(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.COMPOR_IMAGE_QUALITY_REVIEW;
  if (mode === undefined || mode === 'off') {
    return {
      qualityHoldEnabled: false,
      createHandler: (authenticate: Authenticate) => createImageHandler({ authenticate }),
    };
  }
  const apiKey = env.COMPOR_IMAGE_REVIEW_OPENAI_API_KEY;
  if (mode !== 'required' || !apiKey || !/^sk-[^\s]{20,300}$/.test(apiKey)) return null;

  const reviewCandidate = createOpenAiImageCandidateReviewer({ apiKey });
  return {
    qualityHoldEnabled: true,
    createHandler: (authenticate: Authenticate) => createImageHandler({ authenticate, reviewCandidate }),
  };
}
