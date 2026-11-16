// Loaded only by the verification supervisor via Node --import. It is not part
// of the application, an environment-selectable production endpoint, or a
// substitute for the container's network namespace.
if (!process.env.COMPOR_VERIFICATION_RUN_ID || process.env.COMPOR_VERIFICATION_GATEWAY !== 'https://127.0.0.1:3443') {
  throw Error('verification transport requires the isolated supervisor');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const request = new Request(input, options);
  const url = new URL(request.url);
  if (url.origin === 'https://api.openai.com' &&
      (/^\/v1\/agents\/sessions(?:\/|$)/.test(url.pathname) || /^\/v1\/images\/(generations|edits)$/.test(url.pathname))) {
    const destination = new URL(`/provider${url.pathname}${url.search}`, process.env.COMPOR_VERIFICATION_GATEWAY);
    return originalFetch(new Request(destination, request));
  }
  if (!['http://127.0.0.1:3000', 'https://127.0.0.1:3443'].includes(url.origin)) {
    throw Error('verification_transport_destination_denied');
  }
  return originalFetch(request);
};
