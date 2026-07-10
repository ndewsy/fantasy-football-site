import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress CLI output in local dev; set SENTRY_AUTH_TOKEN in Vercel for
  // source map uploads on production builds.
  silent: !process.env.CI,

  // Upload source maps so stack traces show original code, not minified output.
  // Requires SENTRY_AUTH_TOKEN to be set (Vercel env var, not committed).
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Automatically tree-shake Sentry logger in production.
  disableLogger: true,

  // Widen the file glob for client-side source maps.
  widenClientFileUpload: true,
});
