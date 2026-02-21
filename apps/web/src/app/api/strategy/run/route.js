import { getAppInstance } from '../../../app-instance.js';

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const header = request?.headers?.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const app = await getAppInstance();
    const response = await app.manualStrategySync();
    return Response.json(response.body, { status: response.status });
  } catch (error) {
    return Response.json(
      { error: 'strategy_sync_failed', message: error?.message || String(error) },
      { status: 500 },
    );
  }
}
