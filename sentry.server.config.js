import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  // Local `npm run dev` runs (yours or an agent's) shouldn't page anyone —
  // only the deployed production site should ever report to Sentry.
  enabled: process.env.NODE_ENV === "production",
});
