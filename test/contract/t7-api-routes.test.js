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
  getStrategyTemplateHandler,
  getStrategyTeamHandler,
  postStrategyRunHandler,
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

  await db.insert('pipeline_runs', {
    run_id: 'run-1',
    started_at: '2026-02-21T00:00:00Z',
    finished_at: '2026-02-21T00:01:00Z',
    status: 'completed',
  });

  await db.insert('recommendations_snapshot', {
    run_id: 'run-1',
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
  assert.equal(typeof rec.template_ownership_pct, 'number');
  assert.equal(typeof rec.template_gap_score, 'number');
  assert.equal(typeof rec.momentum_signal, 'number');
  assert.equal(typeof rec.data_freshness?.fetched_at, 'string');
});

test('GET /api/recommendations returns latest run rows only', async () => {
  const db = createDatabase();
  await runMigrations(db);

  await db.insert('pipeline_runs', {
    run_id: 'run-old',
    started_at: '2026-02-20T00:00:00Z',
    finished_at: '2026-02-20T00:01:00Z',
    status: 'completed',
  });
  await db.insert('pipeline_runs', {
    run_id: 'run-new',
    started_at: '2026-02-21T00:00:00Z',
    finished_at: '2026-02-21T00:01:00Z',
    status: 'completed',
  });

  await db.insert('recommendations_snapshot', { run_id: 'run-old', player_id: 1, player_name: 'Old', action: 'SELL', confidence: 50, score_5gw: 30, updated_at: '2026-02-20T00:00:30Z' });
  await db.insert('recommendations_snapshot', { run_id: 'run-new', player_id: 2, player_name: 'New A', action: 'BUY', confidence: 90, score_5gw: 80, updated_at: '2026-02-21T00:00:30Z' });
  await db.insert('recommendations_snapshot', { run_id: 'run-new', player_id: 3, player_name: 'New B', action: 'HOLD', confidence: 70, score_5gw: 60, updated_at: '2026-02-21T00:00:31Z' });

  const response = await getRecommendationsHandler({ db });
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 2);
  assert.equal(response.body.every((row) => row.run_id === 'run-new'), true);
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

test('GET /api/strategy/template returns rows sorted by ownership', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.insert('elite_template_snapshot', { snapshot_gw: 1, player_id: 1, template_ownership_pct: 22, buy_momentum: 2, created_at: '2026-02-21T00:00:00Z' });
  await db.insert('elite_template_snapshot', { snapshot_gw: 1, player_id: 1, template_ownership_pct: 12, buy_momentum: 0, created_at: '2026-02-20T00:00:00Z' });
  await db.insert('elite_template_snapshot', { snapshot_gw: 1, player_id: 2, template_ownership_pct: 55, created_at: '2026-02-21T00:00:00Z' });

  const response = await getStrategyTemplateHandler({ db, query: { limit: 5 } });
  assert.equal(response.status, 200);
  assert.equal(response.body[0].player_id, 2);
  assert.equal(response.body.filter((row) => row.player_id === 1).length, 1);
  assert.equal(response.body.find((row) => row.player_id === 1)?.template_ownership_pct, 22);
  assert.equal(typeof response.body[0].data_freshness?.fetched_at, 'string');
});

test('GET /api/strategy/team returns latest insight for entry', async () => {
  const db = createDatabase();
  await runMigrations(db);
  await db.insert('team_strategy_insights', { entry_id: 123, confidence: 60, diagnostic_code: null, created_at: '2026-02-20T00:00:00Z' });
  await db.insert('team_strategy_insights', { entry_id: 123, confidence: 78, diagnostic_code: 'no_cohort_rows', created_at: '2026-02-21T00:00:00Z' });

  const response = await getStrategyTeamHandler({ db, query: { entry_id: 123 } });
  assert.equal(response.status, 200);
  assert.equal(response.body.confidence, 78);
  assert.equal(response.body.diagnostic_code, 'no_cohort_rows');
  assert.equal(typeof response.body.data_freshness?.fetched_at, 'string');
});

test('GET /api/strategy/team returns diagnostic code when no strategy rows exist', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const response = await getStrategyTeamHandler({ db, query: { entry_id: 123 } });
  assert.equal(response.status, 200);
  assert.equal(response.body.confidence, 0);
  assert.equal(typeof response.body.diagnostic_code, 'string');
});

test('POST /api/strategy/run triggers strategy pipeline', async () => {
  let called = false;
  const response = await postStrategyRunHandler({
    runStrategy: async () => {
      called = true;
      return { status: 'completed' };
    },
  });

  assert.equal(response.status, 202);
  assert.equal(called, true);
});
