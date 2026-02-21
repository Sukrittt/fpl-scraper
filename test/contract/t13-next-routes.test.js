import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getSettingsRoute, POST as postSettingsRoute } from '../../apps/web/src/app/api/settings/route.js';
import { GET as getRecommendationsRoute } from '../../apps/web/src/app/api/recommendations/route.js';
import { GET as getRunsRoute } from '../../apps/web/src/app/api/runs/route.js';
import { GET as getEventsRoute } from '../../apps/web/src/app/api/events/route.js';
import { GET as getVideosRoute } from '../../apps/web/src/app/api/videos/route.js';
import { POST as postSyncRoute } from '../../apps/web/src/app/api/sync/run/route.js';
import { GET as getStrategyTemplateRoute } from '../../apps/web/src/app/api/strategy/template/route.js';
import { GET as getStrategyTeamRoute } from '../../apps/web/src/app/api/strategy/team/route.js';
import { POST as postStrategyRoute } from '../../apps/web/src/app/api/strategy/run/route.js';
import { resetAppInstance } from '../../apps/web/src/app/app-instance.js';

test.beforeEach(() => {
  resetAppInstance();
  delete process.env.CRON_SECRET;
});

test('settings route returns JSON response', async () => {
  const response = await getSettingsRoute();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body, 'object');
});

test('settings route accepts POST and persists settings payload', async () => {
  const payload = {
    entry_id: 123456,
    ollama_base_url: 'http://127.0.0.1:11434',
    ollama_model: 'llama3.1:8b-instruct',
    channels: ['chan-a', 'chan-b'],
  };

  const postReq = new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const postResponse = await postSettingsRoute(postReq);
  assert.equal(postResponse.status, 200);
  const postBody = await postResponse.json();
  assert.equal(postBody.entry_id, payload.entry_id);
  assert.deepEqual(postBody.channels, payload.channels);

  const getResponse = await getSettingsRoute();
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.equal(getBody.entry_id, payload.entry_id);
  assert.deepEqual(getBody.channels, payload.channels);
});

test('recommendations route returns array JSON', async () => {
  const response = await getRecommendationsRoute();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body), true);
});

test('videos route accepts status search param', async () => {
  const req = new Request('http://localhost/api/videos?status=skipped');
  const response = await getVideosRoute(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body), true);
});

test('runs route returns array JSON', async () => {
  const req = new Request('http://localhost/api/runs?limit=5');
  const response = await getRunsRoute(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body), true);
});

test('events route returns array JSON', async () => {
  const req = new Request('http://localhost/api/events?limit=5');
  const response = await getEventsRoute(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body), true);
});

test('sync run route returns accepted response', async () => {
  const response = await postSyncRoute();
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(typeof body, 'object');
});

test('sync run route returns unauthorized when cron secret mismatches', async () => {
  process.env.CRON_SECRET = 'secret-123';
  const req = new Request('http://localhost/api/sync/run', {
    method: 'POST',
    headers: { authorization: 'Bearer wrong' },
  });

  const response = await postSyncRoute(req);
  assert.equal(response.status, 401);
});

test('strategy template route returns array JSON', async () => {
  const req = new Request('http://localhost/api/strategy/template?limit=5');
  const response = await getStrategyTemplateRoute(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body), true);
});

test('strategy team route returns object with diagnostics when empty', async () => {
  const req = new Request('http://localhost/api/strategy/team?entry_id=123456');
  const response = await getStrategyTeamRoute(req);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body, 'object');
  assert.equal(typeof body.diagnostic_code, 'string');
});

test('strategy run route requires settings and returns 400 by default', async () => {
  const response = await postStrategyRoute();
  assert.equal(response.status, 400);
});
