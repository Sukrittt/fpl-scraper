import { getAppInstance } from '../../app-instance.js';

export async function GET(request) {
  const app = await getAppInstance();
  const url = request ? new URL(request.url) : new URL('http://localhost/api/events');
  const limit = url.searchParams.get('limit');
  const response = await app.getEvents({ limit });
  return Response.json(response.body, { status: response.status });
}
