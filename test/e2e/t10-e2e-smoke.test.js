import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../apps/web/src/app/server.js';

test('manual sync run updates recommendations and dashboard output', async () => {
  const app = createApp({
    nowFn: () => '2026-02-21T12:00:00Z',
    youtubeClient: {
      fetchRecentVideos: async () => [{ video_id: 'vid-1', title: 'GW26', channel: 'FPL Hub', published_at: '2026-02-21T00:00:00Z' }],
      fetchTranscript: async () => 'Buy Salah now',
    },
    fplClient: {
      fetchBootstrapPlayers: async () => [{ player_id: 1, player_name: 'Salah', form: 9.5, price: 13.0 }],
      fetchTeamByEntryId: async () => [{ element: 1 }],
    },
    ollamaClient: {
      summarizeTranscript: async () => 'Salah is top buy',
      extractPlayerMentions: async () => [{ player_name: 'Salah', sentiment: 95, confidence: 88 }],
    },
  });

  await app.updateSettings({
    entry_id: 123456,
    ollama_base_url: 'http://127.0.0.1:11434',
    ollama_model: 'llama3.1:8b-instruct',
    channels: ['fpl-hub-id'],
  });

  const runResponse = await app.manualSync();
  assert.equal(runResponse.status, 202);

  const recs = await app.getRecommendations();
  assert.equal(recs.status, 200);
  assert.equal(recs.body.length, 1);

  const html = await app.renderDashboard();
  assert.match(html, /Transfer Radar/);
  assert.match(html, /Salah/);
});
