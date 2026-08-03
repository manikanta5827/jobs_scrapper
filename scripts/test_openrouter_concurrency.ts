/**
 * scripts/test_openrouter_concurrency.ts
 *
 * Simple script to test OpenRouter API concurrency limits (20, 30, 50 parallel calls).
 *
 * Usage:
 *   LLM_API_KEY="sk-or-v1-xxx" npx tsx scripts/test_openrouter_concurrency.ts
 *   LLM_API_KEY="sk-or-v1-xxx" npx tsx scripts/test_openrouter_concurrency.ts --model="deepseek/deepseek-v4-flash"
 */

import { z } from 'zod';
import { executellmCall } from '../src/services/llm';

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const CONCURRENCY_LEVELS = [20, 30, 50];

const TestResponseSchema = z.object({
  status: z.string(),
  index: z.number(),
});

function getModelFlag(): string {
  const modelArg = process.argv.find((arg) => arg.startsWith('--model='));
  return modelArg ? modelArg.split('=')[1] : DEFAULT_MODEL;
}

async function testSingleCall(
  index: number,
  model: string
): Promise<{ success: boolean; durationMs: number; error?: string }> {
  const start = Date.now();
  try {
    const prompt = `Return a JSON object with status="ok" and index=${index}. Keep response minimal.`;
    await executellmCall(
      TestResponseSchema,
      prompt,
      'You are a fast JSON test responder.',
      0,
      { functionId: 'concurrency-test', metadata: { test_index: String(index) } },
      model,
      true // disableThinking
    );
    return { success: true, durationMs: Date.now() - start };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    return { success: false, durationMs: Date.now() - start, error: errorMsg };
  }
}

async function runConcurrencyTest(concurrency: number, model: string) {
  console.log(`\n======================================================`);
  console.log(`[Test] Launching ${concurrency} parallel calls to ${model}...`);
  console.log(`======================================================`);

  const startTime = Date.now();
  const promises = Array.from({ length: concurrency }, (_, i) =>
    testSingleCall(i + 1, model)
  );
  const results = await Promise.allSettled(promises);
  const totalTimeMs = Date.now() - startTime;

  let successful = 0;
  let failed = 0;
  let totalDurationMs = 0;
  const errors = new Map<string, number>();

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.success) {
      successful++;
      totalDurationMs += r.value.durationMs;
    } else {
      failed++;
      const err =
        r.status === 'fulfilled'
          ? r.value.error || 'Unknown error'
          : String(r.reason);
      errors.set(err, (errors.get(err) || 0) + 1);
    }
  }

  const avgDurationMs =
    successful > 0 ? Math.round(totalDurationMs / successful) : 0;

  console.log(`\n📊 Concurrency ${concurrency} Results:`);
  console.log(
    `   - Successful:  ${successful}/${concurrency} (${((successful / concurrency) * 100).toFixed(1)}%)`
  );
  console.log(`   - Failed:      ${failed}/${concurrency}`);
  console.log(`   - Total Time:  ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`   - Avg Latency: ${avgDurationMs}ms (successful calls)`);

  if (errors.size > 0) {
    console.log(`\n❌ Rejection / Error Summary:`);
    for (const [err, count] of errors.entries()) {
      console.log(`   - [${count}x] ${err}`);
    }
  } else {
    console.log(`\n✅ All ${concurrency} parallel calls succeeded without rejection!`);
  }
}

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.error(`❌ Error: LLM_API_KEY environment variable is required.`);
    console.error(
      `   Usage: LLM_API_KEY="sk-or-v1-xxx" npx tsx scripts/test_openrouter_concurrency.ts`
    );
    process.exit(1);
  }

  const model = getModelFlag();
  console.log(`🚀 OpenRouter LLM Concurrency Test`);
  console.log(`   Model: ${model}`);
  console.log(`   Levels to test: ${CONCURRENCY_LEVELS.join(', ')}`);

  for (const level of CONCURRENCY_LEVELS) {
    await runConcurrencyTest(level, model);
    // Add a short pause between test runs to avoid immediate burst accumulation
    if (level !== CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length - 1]) {
      console.log(`\nWaiting 3 seconds before next concurrency test...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log(`\n🏁 Concurrency test suite completed.`);
}

main().catch((err) => {
  console.error(`Fatal Error in test suite:`, err);
  process.exit(1);
});
