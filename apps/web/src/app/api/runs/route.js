import { getAppInstance } from '../../app-instance.js';

export async function GET(request) {
  const app = await getAppInstance();
  const url = request ? new URL(request.url) : new URL('http://localhost/api/runs');
  const limit = url.searchParams.get('limit');
  const response = await app.getRuns({ limit });
  return Response.json(response.body, { status: response.status });
}
