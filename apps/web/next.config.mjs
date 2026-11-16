// Project agent instructions are owner-managed; Next.js must not rewrite them.
const nextConfig = {
  agentRules: false,
  // Browser tests run two files at once; test/next-dist-dir.mjs gives each its own dist dir.
  distDir: process.env.COMPOR_TEST_NEXT_DIST_DIR || '.next',
  // Project and post URLs render the single studio page; lib/studio-route.ts reads the path on the client.
  async rewrites() {
    return [{ source: '/projetos/:path*', destination: '/' }];
  },
  turbopack: {
    rules: {
      // proxy.ts inlines the entry stylesheets into the script-free entry (ADR 0034).
      '*.css': { condition: { query: '?text' }, type: 'text' },
    },
  },
};

export default nextConfig;
