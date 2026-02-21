import { getAppInstance } from '../../apps/web/src/app/app-instance.js';
import DashboardApp from '../components/dashboard-app.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const app = await getAppInstance();
  const [settings, recommendations, runs, events, videos] = await Promise.all([
    app.getSettings(),
    app.getRecommendations(),
    app.getRuns({ limit: 20 }),
    app.getEvents({ limit: 30 }),
    app.getVideos({}),
  ]);

  return (
    <DashboardApp
      initialSettings={settings.body}
      initialRecommendations={recommendations.body || []}
      initialRuns={runs.body || []}
      initialEvents={events.body || []}
      initialVideos={videos.body || []}
      updatedAtIso={new Date().toISOString()}
    />
  );
}
