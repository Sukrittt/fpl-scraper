import { getAppInstance } from '../../apps/web/src/app/app-instance.js';
import DashboardApp from '../components/dashboard-app.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const app = await getAppInstance();
  const strategyEnabled = process.env.ENABLE_STRATEGY_DASHBOARD === '1';
  const [settings, recommendations, runs, events, videos, strategyTemplate, strategyTeam, liveGwRes] = await Promise.all([
    app.getSettings(),
    app.getRecommendations(),
    app.getRuns({ limit: 20 }),
    app.getEvents({ limit: 30 }),
    app.getVideos({}),
    strategyEnabled ? app.getStrategyTemplate({ limit: 40 }) : Promise.resolve({ body: [] }),
    strategyEnabled ? app.getStrategyTeam({}) : Promise.resolve({ body: null }),
    app.getLiveGameweek(),
  ]);

  return (
    <DashboardApp
      strategyEnabled={strategyEnabled}
      initialLiveGw={liveGwRes.body?.gameweek || null}
      initialSettings={settings.body}
      initialRecommendations={recommendations.body || []}
      initialRuns={runs.body || []}
      initialEvents={events.body || []}
      initialVideos={videos.body || []}
      initialStrategyTemplate={strategyTemplate.body || []}
      initialStrategyTeam={strategyTeam.body || null}
      updatedAtIso={new Date().toISOString()}
    />
  );
}
