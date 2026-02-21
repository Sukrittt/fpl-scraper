import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, runMigrations } from '../../apps/web/src/lib/db.js';
import { createPipelineRunner } from '../../packages/pipeline/src/pipeline-runner.js';

test('pipeline run processes videos and stores recommendations', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const runner = createPipelineRunner({
    db,
    fplClient: {
      fetchBootstrapPlayers: async () => [
        { player_id: 1, player_name: 'Salah', form: 90, price: 13.0 },
      ],
      fetchTeamByEntryId: async () => [{ element: 1 }],
    },
    youtubeClient: {
      fetchRecentVideos: async () => [{ video_id: 'v1', title: 'GW Tips', channel: 'FPL X', published_at: '2026-02-21T00:00:00Z' }],
      fetchTranscript: async () => 'Salah is a top buy this week',
    },
    ollamaClient: {
      summarizeTranscript: async () => 'Salah is the best buy.',
      extractPlayerMentions: async () => [{ player_name: 'Salah', sentiment: 90, confidence: 80 }],
    },
    nowFn: () => '2026-02-21T10:00:00Z',
  });

  const result = await runner.run({ entryId: 123, channels: ['channel-1'] });

  assert.equal(result.status, 'completed');
  const rows = await db.getAll('recommendations_snapshot');
  assert.equal(rows.length, 1);
});

test('pipeline run skips videos with missing transcript and logs reason', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const runner = createPipelineRunner({
    db,
    fplClient: {
      fetchBootstrapPlayers: async () => [],
      fetchTeamByEntryId: async () => [],
    },
    youtubeClient: {
      fetchRecentVideos: async () => [{ video_id: 'v2', title: 'No caption', channel: 'FPL Y', published_at: '2026-02-21T00:00:00Z' }],
      fetchTranscript: async () => null,
    },
    ollamaClient: {
      summarizeTranscript: async () => '',
      extractPlayerMentions: async () => [],
    },
    nowFn: () => '2026-02-21T10:00:00Z',
  });

  const result = await runner.run({ entryId: 123, channels: ['channel-1'] });
  const video = (await db.getAll('videos'))[0];

  assert.equal(result.status, 'completed');
  assert.equal(video.status, 'skipped');
  assert.equal(video.skip_reason, 'missing_transcript');
});
