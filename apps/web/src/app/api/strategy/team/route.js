import { getAppInstance } from '../../../app-instance.js';

export async function GET(request) {
  const app = await getAppInstance();
  const url = request ? new URL(request.url) : new URL('http://localhost/api/strategy/team');
  const entryId = url.searchParams.get('entry_id');
  const response = await app.getStrategyTeam({ entry_id: entryId });
  return Response.json(response.body, { status: response.status });
}
