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
    // There are no App Router pages for the Pages Router to match.
    clientRouterFilter: false,
  },
  // Browser tests run two files at once; test/next-dist-dir.mjs gives each its own dist dir.
  distDir: process.env.COMPOR_TEST_NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['playwright-core-carousel'],
  outputFileTracingIncludes: {
    '/api/studio/carousel/render': [
      './node_modules/@sparticuz/chromium/bin/*.br',
      './node_modules/@img/sharp-linux-x64/**/*',
      './node_modules/@img/sharp-libvips-linux-x64/**/*',
      './public/studio/dm-sans-regular.ttf',
      './public/studio/dm-sans-bold.ttf',
    ],
  },
  // Project and post URLs render the single studio page; lib/studio-route.ts reads the path on the client.
  async rewrites() {
    return [
      { source: '/projetos/:path*', destination: '/' },
      { source: '/.well-known/oauth-protected-resource/api/mcp', destination: '/api/__compor_bridge/discovery/oauth-protected-resource/api/mcp' },
      { source: '/auth/callback', destination: '/api/__compor_bridge/auth/callback' },
      { source: '/auth/session', destination: '/api/__compor_bridge/auth/session' },
      { source: '/auth/sign-in', destination: '/api/__compor_bridge/auth/sign-in' },
      { source: '/auth/sign-out', destination: '/api/__compor_bridge/auth/sign-out' },
      { source: '/favicon.ico', destination: '/api/__compor_bridge/favicon' },
      { source: '/oauth/consent', destination: '/api/__compor_bridge/oauth/consent' },
      { source: '/oauth/decision', destination: '/api/__compor_bridge/oauth/decision' },
    ];
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
