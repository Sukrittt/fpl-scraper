import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, runMigrations } from '../../apps/web/src/lib/db.js';
import { createStrategyRunner } from '../../packages/pipeline/src/strategy-runner.js';

test('strategy runner persists template and team insights', async () => {
  const db = createDatabase();
  await runMigrations(db);

  const runner = createStrategyRunner({
    db,
    nowFn: () => '2026-02-21T12:00:00Z',
    fplClient: {
      fetchBootstrapPlayers: async () => [
        { player_id: 11, player_name: 'Salah', position_id: 3 },
        { player_id: 12, player_name: 'Saka', position_id: 3 },
      ],
      fetchCurrentEvent: async () => 26,
      fetchTopManagers: async () => [
        { entry_id: 101, overall_rank: 1, total_points: 1800, current_event: 26 },
        { entry_id: 102, overall_rank: 2, total_points: 1790, current_event: 26 },
      ],
      fetchTeamByEntryId: async (entryId) => {
        if (entryId === 123456) {
          return [{ element: 12, position: 1, is_captain: false, is_vice_captain: false }];
        }
        return [
          { element: 11, position: 1, is_captain: true, is_vice_captain: false },
          { element: 12, position: 2, is_captain: false, is_vice_captain: true },
        ];
      },
    },
  });

  const result = await runner.run({ entryId: 123456 });
  assert.equal(result.status, 'completed');

  const templateRows = await db.getAll('elite_template_snapshot');
  const insights = await db.getAll('team_strategy_insights');
  assert.equal(templateRows.length > 0, true);
  assert.equal(insights.length, 1);
  assert.equal(Array.isArray(insights[0].recommended_in), true);
});
