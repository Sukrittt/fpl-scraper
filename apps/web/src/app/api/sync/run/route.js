import { getAppInstance } from '../../../app-instance.js';

const DEFAULT_SETTINGS = {
  entry_id: 0,
  ollama_base_url: 'http://127.0.0.1:11434',
  ollama_model: 'llama3.1:8b-instruct',
  channels: [],
};

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

  const app = await getAppInstance();
  const settings = await app.getSettings();
  if (!settings.body) {
    await app.updateSettings(DEFAULT_SETTINGS);
  }

  const response = await app.manualSync();
  return Response.json(response.body, { status: response.status });
}
