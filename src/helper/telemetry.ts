import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PostHogSpanProcessor } from "@posthog/ai/otel";

let initialized = false;

/**
 * Initializes OpenTelemetry NodeSDK with PostHogSpanProcessor for AI observability.
 * Emits gen_ai.* spans captured by Vercel AI SDK into PostHog $ai_generation events.
 * Safe to call multiple times. Skips initialization if no token is configured.
 */
export function initTelemetry(): void {
  if (initialized) return;

  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

  if (token) {
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ "service.name": "job-scraper-lambda" }),
      spanProcessors: [
        new PostHogSpanProcessor({
          projectToken: token,
          host: host,
        }),
      ],
    });
    sdk.start();
    initialized = true;
  }
}

/**
 * AI SDK telemetry helper option generator.
 * Pass the return object to `experimental_telemetry` parameter in `generateObject`, `generateText`, etc.
 */
export function aiTelemetry(functionId: string, metadata: Record<string, string> = {}) {
  initTelemetry();
  return {
    isEnabled: true as const,
    functionId,
    metadata,
  };
}
