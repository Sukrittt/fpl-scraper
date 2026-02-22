import { getAppInstance } from '../../app-instance.js';

export async function GET() {
  const app = await getAppInstance();
  const response = await app.getLiveGameweek();
  return Response.json(response.body, { status: response.status });
}
