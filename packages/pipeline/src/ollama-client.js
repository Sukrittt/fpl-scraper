function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createOllamaClient({ fetchFn = fetch, baseUrl = 'http://127.0.0.1:11434', model = 'llama3.1:8b-instruct' } = {}) {
  async function generate(prompt) {
    const response = await fetchFn(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!response.ok) {
      throw new Error('Ollama request failed');
    }

    const data = await response.json();
    return data.response || '';
  }

  return {
    async summarizeTranscript(transcript) {
      const prompt = `Summarize this FPL video transcript in under 120 words: ${transcript}`;
      return generate(prompt);
    },

    async extractPlayerMentions(summary) {
      const prompt = [
        'Extract FPL player mentions as JSON array with fields player_name, sentiment, confidence.',
        'Return JSON only.',
        summary,
      ].join('\n');

      const output = await generate(prompt);
      const parsed = safeJsonParse(output);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    },
  };
}
