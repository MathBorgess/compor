declare const __CF_WEB_ANALYTICS_TOKEN__: string;

/**
 * Build-time site token for Cloudflare Web Analytics.
 * Empty string: the beacon script is not rendered.
 * Set CF_WEB_ANALYTICS_TOKEN when running the build. Do not commit a token.
 */
export const CF_WEB_ANALYTICS_TOKEN = __CF_WEB_ANALYTICS_TOKEN__.trim();
