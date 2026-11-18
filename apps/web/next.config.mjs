// Project agent instructions are owner-managed; Next.js must not rewrite them.
const nextConfig = {
  agentRules: false,
  // Reduce production chunk overhead; see the measured cache trade-off in docs/quality.
  experimental: {
    turbopackCjsTreeShaking: true,
    turbopackChunking: { minChunkSize: 1000000, maxMergeChunkSize: 3000000 },
    // The studio has one page. Project and post history use the browser History API.
    optimisticRouting: false,
    prefetchInlining: false,
  },
  // Browser tests run two files at once; test/next-dist-dir.mjs gives each its own dist dir.
  distDir: process.env.COMPOR_TEST_NEXT_DIST_DIR || '.next',
  // Project and post URLs render the single studio page; lib/studio-route.ts reads the path on the client.
  async rewrites() {
    return [{ source: '/projetos/:path*', destination: '/' }];
  },
  turbopack: {
    rules: {
      // Tree-shake the public studio validators together before Turbopack splits modules.
      'schema.ts': {
        condition: { all: ['browser', 'production', { path: /^(?:apps\/web\/)?lib\/schema\.ts$/ }] },
        loaders: ['./build/studio-schema-loader.cjs'],
        as: '*.js',
      },
      'schema.js': {
        condition: { all: ['browser', 'production', { path: /^(?:(?:apps\/web\/)?node_modules\/@compor|packages)\/agile-deliberation\/src\/schema\.js$/ }] },
        loaders: [{ loader: './build/studio-schema-loader.cjs', options: { reuseStudioFacade: true } }],
        as: '*.js',
      },
      // proxy.ts inlines the entry stylesheets into the script-free entry (ADR 0034).
      '*.css': { condition: { query: '?text' }, type: 'text' },
    },
  },
};

export default nextConfig;
