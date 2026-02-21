import { createDatabase, runMigrations } from '../lib/db.js';
import { renderTransferRadar } from '../lib/transfer-radar.js';
import {
  getSettingsHandler,
  getRecommendationsHandler,
  getRunsHandler,
  getEventsHandler,
  getVideosHandler,
  postSyncRunHandler,
  getStrategyTemplateHandler,
  getStrategyTeamHandler,
  postStrategyRunHandler,
} from './api/handlers.js';
import { createPipelineRunner } from '../../../../packages/pipeline/src/pipeline-runner.js';
import { createStrategyRunner } from '../../../../packages/pipeline/src/strategy-runner.js';

export function createApp({ nowFn, youtubeClient, fplClient, ollamaClient, dbProvider, supabaseClient } = {}) {
  const db = createDatabase({ provider: dbProvider, supabaseClient });
  const dbReady = runMigrations(db);

  const pipelineRunner = createPipelineRunner({
    db,
    nowFn,
    youtubeClient,
    fplClient,
    ollamaClient,
  });
  const strategyRunner = createStrategyRunner({
    db,
    nowFn,
    fplClient,
  });

  return {
    async updateSettings(payload) {
      await dbReady;
      await db.upsert('settings', payload);
      return { status: 200, body: payload };
    },

    async getSettings() {
      await dbReady;
      return getSettingsHandler({ db });
    },

    async manualSync() {
      await dbReady;
      const settings = await db.getOne('settings');
      if (!settings) {
        return { status: 400, body: { error: 'settings_not_found' } };
      }

      return postSyncRunHandler({
        runPipeline: async () => pipelineRunner.run({ entryId: settings.entry_id, channels: settings.channels }),
      });
    },

    async getRecommendations() {
      await dbReady;
      return getRecommendationsHandler({ db });
    },

    async getRuns(query = {}) {
      await dbReady;
      return getRunsHandler({ db, query });
    },

    async getEvents(query = {}) {
      await dbReady;
      return getEventsHandler({ db, query });
    },

    async getVideos(query = {}) {
      await dbReady;
      return getVideosHandler({ db, query });
    },

    async runStrategy({ entryId, riskProfile = 'balanced_template_aware' }) {
      await dbReady;
      return postStrategyRunHandler({
        runStrategy: async () => strategyRunner.run({ entryId, riskProfile }),
      });
    },

    async getStrategyTemplate(query = {}) {
      await dbReady;
      return getStrategyTemplateHandler({ db, query });
    },

    async getStrategyTeam(query = {}) {
      await dbReady;
      return getStrategyTeamHandler({ db, query });
    },

    async manualStrategySync() {
      await dbReady;
      const settings = await db.getOne('settings');
      if (!settings?.entry_id) {
        return { status: 400, body: { error: 'settings_not_found' } };
      }

      return postStrategyRunHandler({
        runStrategy: async () => strategyRunner.run({
          entryId: settings.entry_id,
          riskProfile: settings.risk_profile || 'balanced_template_aware',
        }),
      });
    },

    async renderDashboard() {
      await dbReady;
      const recommendations = await db.getAll('recommendations_snapshot');
      const settings = await db.getOne('settings');
      const runs = (await getRunsHandler({ db, query: { limit: 10 } })).body;
      const events = (await getEventsHandler({ db, query: { limit: 12 } })).body;
      const videos = await db.getAll('videos');
      const strategyTemplate = (await getStrategyTemplateHandler({ db, query: { limit: 25 } })).body;
      const strategyTeam = (await getStrategyTeamHandler({ db, query: { entry_id: settings?.entry_id } })).body;
      return renderTransferRadar({
        loading: false,
        error: null,
        recommendations,
        settings,
        runs,
        events,
        videos,
        strategyTemplate,
        strategyTeam,
      });
    },

    db,
  };
}
