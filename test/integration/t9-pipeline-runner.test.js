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
  assert.equal(typeof rows[0].run_id, 'string');

  const runs = await db.getAll('pipeline_runs');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'completed');
  assert.equal(runs[0].run_id, result.run_id);
  assert.equal(runs[0].started_at, '2026-02-21T10:00:00Z');
  assert.equal(runs[0].finished_at, '2026-02-21T10:00:00Z');
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

test('pipeline run logs distribution alert when BUY share is very low', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const runner = createPipelineRunner({
    db,
    fplClient: {
      fetchBootstrapPlayers: async () => [
        { player_id: 1, player_name: 'A', form: 0.2, price: 12.0 },
        { player_id: 2, player_name: 'B', form: 0.3, price: 12.5 },
      ],
      fetchTeamByEntryId: async () => [{ element: 1 }, { element: 2 }],
    },
    youtubeClient: {
      fetchRecentVideos: async () => [],
      fetchTranscript: async () => null,
    },
    ollamaClient: {
      summarizeTranscript: async () => '',
      extractPlayerMentions: async () => [],
    },
    nowFn: () => '2026-02-21T10:00:00Z',
  });

  await runner.run({ entryId: 123, channels: ['channel-1'] });
  const events = await db.getAll('pipeline_events');
  const hasGuardrail = events.some((event) => String(event.message || '').includes('Recommendation distribution alert'));
  assert.equal(hasGuardrail, true);
});

test('pipeline run marks run as failed and emits error event on exception', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const runner = createPipelineRunner({
    db,
    fplClient: {
      fetchBootstrapPlayers: async () => {
        throw new Error('fpl_bootstrap_failed');
      },
      fetchTeamByEntryId: async () => [],
    },
    youtubeClient: {
      fetchRecentVideos: async () => [{ video_id: 'v3', title: 'Bad video', channel: 'FPL Z', published_at: '2026-02-21T00:00:00Z' }],
      fetchTranscriptWithDiagnostics: async () => ({ transcript: 'Salah buy', reason: null }),
    },
    ollamaClient: {
      summarizeTranscript: async () => {
        throw new Error('llm_unavailable');
      },
      extractPlayerMentions: async () => [],
    },
    nowFn: () => '2026-02-21T10:00:00Z',
  });

  await assert.rejects(() => runner.run({ entryId: 123, channels: ['channel-1'] }), /fpl_bootstrap_failed/);

  const runs = await db.getAll('pipeline_runs');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'failed');
  assert.equal(runs[0].finished_at, '2026-02-21T10:00:00Z');

  const events = await db.getAll('pipeline_events');
  const hasFailure = events.some((event) => String(event.message || '').includes('Pipeline failed'));
  assert.equal(hasFailure, true);
});
