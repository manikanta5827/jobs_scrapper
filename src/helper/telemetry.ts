import { PostHog } from "posthog-node";
import { withTracing } from "@posthog/ai/vercel";

let phClient: PostHog | null = null;

/**
 * Initializes and returns singleton PostHog Node client for AI Observability.
 * Skips initialization if POSTHOG_PROJECT_TOKEN is missing or blank.
 */
export function getPostHogClient(): PostHog | null {
  if (phClient) return phClient;

  const token = process.env.POSTHOG_PROJECT_TOKEN;
  const host = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

  if (token && token.trim().length > 0) {
    phClient = new PostHog(token, {
      host: host,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return phClient;
}

/**
 * Wraps a Vercel AI SDK language model with PostHog AI Observability tracing.
 * Captures inputs, outputs, tokens, latency, and model metadata as $ai_generation events in PostHog.
 */
export function wrapModelWithTelemetry<T>(
  model: T,
  options?: { functionId?: string; metadata?: Record<string, string> }
): T {
  const client = getPostHogClient();
  if (!client) return model;

  try {
    return withTracing(model as any, client, {
      posthogProperties: {
        $service_name: process.env.AWS_LAMBDA_FUNCTION_NAME || "job-scraper-lambda",
        ...(options?.functionId ? { function_id: options.functionId } : {}),
        ...options?.metadata,
      },
    }) as unknown as T;
  } catch (err) {
    console.warn("Failed to wrap model with PostHog tracing:", err);
    return model;
  }
}

/**
 * Flushes pending PostHog AI events and shuts down client.
 * Call this in Lambda handler finally block to ensure zero event loss before environment freezes.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (phClient) {
    try {
      await phClient.shutdown();
    } catch (err) {
      console.warn("Failed to shutdown PostHog client:", err);
    } finally {
      phClient = null;
    }
  }
}
