import { createEliteCohortAgent } from './elite-cohort-agent.js';
import { createTemplateAgent } from './template-agent.js';
import { createTransferPatternAgent } from './transfer-pattern-agent.js';
import { createTeamFitAgent } from './team-fit-agent.js';

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function latestSnapshotGw(rows = []) {
  return [...rows]
    .sort((a, b) => toNum(b.snapshot_gw) - toNum(a.snapshot_gw))[0]?.snapshot_gw || null;
}

export function createStrategyRunner({ db, fplClient, nowFn = () => new Date().toISOString() }) {
  const eliteAgent = createEliteCohortAgent({ fplClient, nowFn });
  const templateAgent = createTemplateAgent({ nowFn });
  const transferAgent = createTransferPatternAgent();
  const teamFitAgent = createTeamFitAgent({ nowFn });

  return {
    async run({ entryId, riskProfile = 'balanced_template_aware' }) {
      const players = await fplClient.fetchBootstrapPlayers();
      const currentEvent = await fplClient.fetchCurrentEvent();
      const snapshotGw = currentEvent || null;

      const cohort = await eliteAgent.run({ players, snapshotGw });
      const warnings = [];
      if ((cohort.managers || []).length === 0) {
        warnings.push('elite_cohort_unavailable');
      }

      for (const row of cohort.managers) {
        await db.insert('elite_managers_snapshot', row);
      }
      for (const row of cohort.picks) {
        await db.insert('elite_manager_picks_snapshot', row);
      }

      const template = templateAgent.run({
        snapshotGw,
        managers: cohort.managers,
        picks: cohort.picks,
      });

      const existingTemplate = await db.getAll('elite_template_snapshot');
      const newestGw = latestSnapshotGw(existingTemplate);
      const previousTemplate = newestGw === null
        ? []
        : existingTemplate.filter((row) => Number(row.snapshot_gw) === Number(newestGw));

      const templateWithMomentum = transferAgent.run({
        currentTemplate: template.templateRows,
        previousTemplate,
      });

      for (const row of templateWithMomentum) {
        await db.insert('elite_template_snapshot', row);
      }

      const teamPicks = entryId ? await fplClient.fetchTeamByEntryId(entryId, snapshotGw || 1) : [];
      const insight = teamFitAgent.run({
        snapshotGw,
        entryId,
        riskProfile,
        teamPicks,
        templateRows: templateWithMomentum,
        players,
      });
      await db.insert('team_strategy_insights', insight);

      return {
        status: warnings.length ? 'completed_with_warnings' : 'completed',
        snapshot_gw: snapshotGw,
        managers_processed: cohort.managers.length,
        picks_processed: cohort.picks.length,
        template_rows: templateWithMomentum.length,
        warnings,
        team_recommendations: {
          in: insight.recommended_in.length,
          out: insight.recommended_out.length,
        },
      };
    },
  };
}
