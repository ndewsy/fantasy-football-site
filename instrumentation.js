import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures all server-side request errors (API routes, Server Components,
// Server Actions) and forwards them to Sentry automatically.
export const onRequestError = Sentry.captureRequestError;
