import { openai } from '@ai-sdk/openai';
import { openai as openaiV5 } from '@ai-sdk/openai-v5';
import { useLLMRecording } from '@internal/llm-recorder';
import { describe, it, expect } from 'vitest';
import { noopLogger } from '../../logger';
import { Agent } from '../agent';

useLLMRecording('image-prompt.e2e.test', {
  transformRequest({ url, body }) {
    console.log('body', JSON.stringify(body, null, 2));
    return {
      url,
      body,
    };
  },
});

describe.for([['v1'], ['v2']])(`Image Prompt E2E Tests (%s)`, ([version]) => {
  const openaiModel = version === 'v1' ? openai('gpt-4o') : openaiV5('gpt-4o');

  it(
    'should download assets from messages',
    {
      timeout: 10_000,
      retry: 3,
    },
    async () => {
      const agent = new Agent({
        id: 'llmPrompt-agent',
        name: 'LLM Prompt Agent',
        instructions: 'test agent',
        model: openaiModel,
      });
      agent.__setLogger(noopLogger);

      let result;

      if (version === 'v1') {
        result = await agent.generateLegacy([
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: 'What is the photo?',
              },
            ],
          },
        ]);
      } else {
        result = await agent.generate([
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png',
                mimeType: 'image/png',
              },
              {
                type: 'text',
                text: 'What is the photo?',
              },
            ],
          },
        ]);
      }

      expect(result.text.toLowerCase()).toContain('google');
    },
  );
});
