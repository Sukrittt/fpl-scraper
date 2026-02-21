import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, runMigrations } from '../../apps/web/src/lib/db.js';
import {
  getSettingsHandler,
  getRecommendationsHandler,
  getRunsHandler,
  getEventsHandler,
  getVideosHandler,
  postSyncRunHandler,
} from '../../apps/web/src/app/api/handlers.js';

test('GET /api/settings returns stored settings', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.upsert('settings', {
    entry_id: 42,
    ollama_base_url: 'http://127.0.0.1:11434',
    ollama_model: 'llama3.1:8b-instruct',
    channels: ['a', 'b'],
  });

  const response = await getSettingsHandler({ db });
  assert.equal(response.status, 200);
  assert.equal(response.body.entry_id, 42);
});

test('GET /api/recommendations returns contract-compliant shape', async () => {
  const db = createDatabase();
  await runMigrations(db);

  await db.insert('recommendations_snapshot', {
    player_id: 1,
    player_name: 'Salah',
    action: 'BUY',
    confidence: 81,
    score_5gw: 76,
    reasons: ['Strong form'],
    evidence_videos: [{ video_id: 'abc', title: 'GW tips' }],
    updated_at: '2026-02-21T00:00:00Z',
  });

  const response = await getRecommendationsHandler({ db });
  assert.equal(response.status, 200);

  const rec = response.body[0];
  assert.equal(typeof rec.player_id, 'number');
  assert.equal(typeof rec.player_name, 'string');
  assert.equal(['BUY', 'SELL', 'HOLD'].includes(rec.action), true);
  assert.equal(Array.isArray(rec.reasons), true);
});

test('GET /api/videos can filter by status', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.insert('videos', { video_id: '1', status: 'processed' });
  await db.insert('videos', { video_id: '2', status: 'skipped' });

  const response = await getVideosHandler({ db, query: { status: 'skipped' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].video_id, '2');
});

test('GET /api/runs returns newest-first and supports limit', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.insert('pipeline_runs', { run_id: 'run-1', started_at: '2026-02-20T00:00:00Z', status: 'completed' });
  await db.insert('pipeline_runs', { run_id: 'run-2', started_at: '2026-02-21T00:00:00Z', status: 'completed' });

  const response = await getRunsHandler({ db, query: { limit: '1' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].run_id, 'run-2');
});

test('GET /api/events returns newest-first and supports limit', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.insert('pipeline_events', { run_id: 'run-1', level: 'info', message: 'old', created_at: '2026-02-20T00:00:00Z' });
  await db.insert('pipeline_events', { run_id: 'run-2', level: 'warn', message: 'new', created_at: '2026-02-21T00:00:00Z' });

  const response = await getEventsHandler({ db, query: { limit: '1' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 1);
  assert.equal(response.body[0].message, 'new');
});

test('POST /api/sync/run triggers pipeline', async () => {
  let called = false;
  const fakeRun = async () => {
    called = true;
    return { run_id: 'run-1' };
  };

  const response = await postSyncRunHandler({ runPipeline: fakeRun });

  assert.equal(response.status, 202);
  assert.equal(called, true);
  assert.equal(response.body.run_id, 'run-1');
});
