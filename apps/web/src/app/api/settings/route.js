import { getAppInstance } from '../../app-instance.js';

export async function GET() {
  const app = await getAppInstance();
  const response = await app.getSettings();
  return Response.json(response.body, { status: response.status });
}

export async function POST(request) {
  const app = await getAppInstance();
  const payload = await request.json();
  const response = await app.updateSettings(payload);
  return Response.json(response.body, { status: response.status });
}
