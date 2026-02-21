import { GET as getSettingsRoute } from '../apps/web/src/app/api/settings/route.js';
import { GET as getRecommendationsRoute } from '../apps/web/src/app/api/recommendations/route.js';
import { GET as getVideosRoute } from '../apps/web/src/app/api/videos/route.js';
import { POST as postSyncRoute } from '../apps/web/src/app/api/sync/run/route.js';
import { resetAppInstance } from '../apps/web/src/app/app-instance.js';

function printBody(prefix, body) {
  const serialized = JSON.stringify(body);
  const output = serialized.length > 200 ? `${serialized.slice(0, 200)}...` : serialized;
  console.log(`${prefix}: ${output}`);
}

async function check(name, response) {
  const body = await response.json();
  console.log(`${name} -> ${response.status}`);
  printBody(`${name} body`, body);
  return { status: response.status, body };
}

async function main() {
  if (process.env.DB_PROVIDER !== 'supabase') {
    throw new Error(`DB_PROVIDER must be "supabase" for this smoke test (current: "${process.env.DB_PROVIDER || ''}")`);
  }

  resetAppInstance();

  const settings = await check('GET /api/settings', await getSettingsRoute());
  if (settings.status !== 200) {
    throw new Error('GET /api/settings failed');
  }

  const headers = {};
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }
  const syncReq = new Request('http://localhost/api/sync/run', { method: 'POST', headers });
  const sync = await check('POST /api/sync/run', await postSyncRoute(syncReq));
  if (sync.status !== 202) {
    throw new Error('POST /api/sync/run failed');
  }

  const recs = await check('GET /api/recommendations', await getRecommendationsRoute());
  if (recs.status !== 200 || !Array.isArray(recs.body)) {
    throw new Error('GET /api/recommendations failed');
  }

  const videosReq = new Request('http://localhost/api/videos?status=processed');
  const videos = await check('GET /api/videos?status=processed', await getVideosRoute(videosReq));
  if (videos.status !== 200 || !Array.isArray(videos.body)) {
    throw new Error('GET /api/videos?status=processed failed');
  }

  console.log('Supabase route smoke validation passed.');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
