import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

const openrouter = createOpenRouter({
  apiKey: '',
});

// Configure the model with OpenRouter-specific provider routing
const model = openrouter('deepseek/deepseek-v4-flash:floor', {
});

async function main() {
    console.time('t');
  const response = await generateText({
    model,
    prompt: 'What are the three laws of robotics?',
  });

  console.timeEnd('t');
  console.log(response.name)
  console.log(response.text);
  console.log(response.usage);
  console.log(response.providerMetadata?.openrouter);
}

main();