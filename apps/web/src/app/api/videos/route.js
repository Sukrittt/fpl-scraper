import { getVideosHandler } from '../handlers.js';
import { getAppInstance } from '../../app-instance.js';

export async function GET(request) {
  const app = await getAppInstance();
  const url = request ? new URL(request.url) : new URL('http://localhost/api/videos');
  const status = url.searchParams.get('status');
  const response = await getVideosHandler({ db: app.db, query: { status } });
  return Response.json(response.body, { status: response.status });
}
