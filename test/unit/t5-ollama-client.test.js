import test from 'node:test';
import assert from 'node:assert/strict';
import { createOllamaClient } from '../../packages/pipeline/src/ollama-client.js';

test('summarizeTranscript returns concise summary text', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ response: 'Salah and Saka are top buy picks for next 5 GWs.' }),
  });

  const client = createOllamaClient({ fetchFn: mockFetch, model: 'llama3.1:8b-instruct' });
  const summary = await client.summarizeTranscript('Long transcript ...');

  assert.match(summary, /Salah/);
});

test('extractPlayerMentions returns empty array on malformed JSON', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ response: 'not-json' }),
  });

  const client = createOllamaClient({ fetchFn: mockFetch, model: 'llama3.1:8b-instruct' });
  const mentions = await client.extractPlayerMentions('summary text');

  assert.deepEqual(mentions, []);
});
