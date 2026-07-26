import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { PostHogSpanProcessor } from "@posthog/ai/otel";

let initialized = false;
let sdkInstance: NodeSDK | null = null;

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
    sdkInstance = new NodeSDK({
      resource: resourceFromAttributes({ "service.name": process.env.AWS_LAMBDA_FUNCTION_NAME || "job-scraper-lambda" }),
      spanProcessors: [
        new PostHogSpanProcessor({
          projectToken: token,
          host: host,
        }),
      ],
    });
    sdkInstance.start();
    initialized = true;
  }
}

/**
 * Flushes pending OpenTelemetry spans and shuts down SDK.
 * Call this in Lambda handler finally block to ensure zero span loss before environment freezes.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
    } catch (err) {
      console.warn("Failed to shutdown OpenTelemetry SDK:", err);
    } finally {
      sdkInstance = null;
      initialized = false;
    }
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
