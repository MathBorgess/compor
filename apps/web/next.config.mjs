// Project agent instructions are owner-managed; Next.js must not rewrite them.
const nextConfig = {
  agentRules: false,
  turbopack: {
    rules: {
      // proxy.ts inlines the entry stylesheets into the script-free entry (ADR 0034).
      '*.css': { condition: { query: '?text' }, type: 'text' },
    },
  },
};

export default nextConfig;
