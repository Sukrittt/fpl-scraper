function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function createTemplateAgent({ nowFn = () => new Date().toISOString() } = {}) {
  return {
    run({ snapshotGw, managers = [], picks = [] }) {
      const managerIds = [...new Set(managers.map((row) => row.manager_entry_id).filter(Boolean))];
      const managerCount = Math.max(1, managerIds.length);

      const perPlayer = new Map();
      const captainCount = new Map();
      const viceCount = new Map();
      const formationCount = new Map();

      for (const manager of managers) {
        const key = manager.formation || 'unknown';
        formationCount.set(key, (formationCount.get(key) || 0) + 1);
      }

      for (const pick of picks) {
        const playerId = toNum(pick.player_id);
        if (!playerId) continue;

        perPlayer.set(playerId, (perPlayer.get(playerId) || 0) + 1);
        if (pick.is_captain) {
          captainCount.set(playerId, (captainCount.get(playerId) || 0) + 1);
        }
        if (pick.is_vice_captain) {
          viceCount.set(playerId, (viceCount.get(playerId) || 0) + 1);
        }
      }

      const templateRows = [...perPlayer.entries()].map(([playerId, count]) => ({
        snapshot_gw: snapshotGw,
        player_id: playerId,
        template_ownership_pct: round((count / managerCount) * 100),
        captain_pct: round(((captainCount.get(playerId) || 0) / managerCount) * 100),
        vice_pct: round(((viceCount.get(playerId) || 0) / managerCount) * 100),
        buy_momentum: 0,
        sell_momentum: 0,
        created_at: nowFn(),
      }));

      const topFormations = [...formationCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([formation, count]) => ({
          formation,
          pct: round((count / managerCount) * 100),
        }));

      return {
        templateRows,
        summary: {
          manager_count: managerCount,
          top_formations: topFormations,
        },
      };
    },
  };
}
