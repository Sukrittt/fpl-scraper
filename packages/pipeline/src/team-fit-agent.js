function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function topBy(rows, key, limit = 5) {
  return [...rows]
    .sort((a, b) => toNum(b[key]) - toNum(a[key]))
    .slice(0, limit);
}

export function createTeamFitAgent({ nowFn = () => new Date().toISOString() } = {}) {
  return {
    run({ snapshotGw, entryId, riskProfile = 'balanced_template_aware', teamPicks = [], templateRows = [], players = [] }) {
      if (!Array.isArray(templateRows) || templateRows.length === 0) {
        return {
          snapshot_gw: snapshotGw,
          entry_id: entryId,
          risk_profile: riskProfile,
          recommended_in: [],
          recommended_out: [],
          confidence: 0,
          diagnostic_code: 'no_cohort_rows',
          why: 'No elite cohort template rows were available for this run.',
          evidence: {},
          created_at: nowFn(),
        };
      }

      const playerById = new Map(players.map((player) => [Number(player.player_id), player]));
      const teamSet = new Set(teamPicks.map((pick) => Number(pick.element || pick.player_id)).filter(Boolean));
      const topTemplate = topBy(templateRows, 'template_ownership_pct', 20);

      const missingTemplate = topTemplate.filter((row) => !teamSet.has(Number(row.player_id)));
      const weakHolds = topBy(
        templateRows.filter((row) => teamSet.has(Number(row.player_id))),
        'sell_momentum',
        8,
      );

      const recommendedIn = topBy(missingTemplate, 'buy_momentum', 5).map((row) => ({
        player_id: row.player_id,
        player_name: playerById.get(Number(row.player_id))?.player_name || `Player ${row.player_id}`,
        template_ownership_pct: row.template_ownership_pct,
        buy_momentum: row.buy_momentum,
      }));

      const recommendedOut = weakHolds
        .filter((row) => toNum(row.sell_momentum) > 0 || toNum(row.template_ownership_pct) < 10)
        .slice(0, 5)
        .map((row) => ({
          player_id: row.player_id,
          player_name: playerById.get(Number(row.player_id))?.player_name || `Player ${row.player_id}`,
          template_ownership_pct: row.template_ownership_pct,
          sell_momentum: row.sell_momentum,
        }));

      const confidence = Math.max(45, Math.min(90, Math.round(
        55 + (recommendedIn.length * 4) + (recommendedOut.length * 3),
      )));

      return {
        snapshot_gw: snapshotGw,
        entry_id: entryId,
        risk_profile: riskProfile,
        recommended_in: recommendedIn,
        recommended_out: recommendedOut,
        confidence,
        why: `Compared against top-cohort template ownership and momentum across ${topTemplate.length} core template slots.`,
        evidence: {
          missing_template_players: missingTemplate.slice(0, 10),
          overexposed_players: weakHolds.slice(0, 10),
        },
        created_at: nowFn(),
      };
    },
  };
}
