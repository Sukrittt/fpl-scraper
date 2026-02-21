function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formationFromPicks(picks = [], playerById = new Map()) {
  let def = 0;
  let mid = 0;
  let fwd = 0;

  for (const pick of picks) {
    const positionId = playerById.get(Number(pick.element))?.position_id;
    if (positionId === 2) def += 1;
    if (positionId === 3) mid += 1;
    if (positionId === 4) fwd += 1;
  }

  return `${def}-${mid}-${fwd}`;
}

export function createEliteCohortAgent({ fplClient, nowFn = () => new Date().toISOString(), cohortSize = 10000 }) {
  return {
    async run({ players = [], snapshotGw = null }) {
      const playerById = new Map(players.map((row) => [Number(row.player_id), row]));
      const managers = await fplClient.fetchTopManagers({ limit: cohortSize, event: snapshotGw });
      const managerRows = [];
      const pickRows = [];
      const eventGw = snapshotGw || null;

      for (const manager of managers) {
        try {
          const picks = await fplClient.fetchTeamByEntryId(manager.entry_id, eventGw || manager.current_event || 1);
          const captain = picks.find((pick) => pick.is_captain);
          const formation = formationFromPicks(picks, playerById);

          managerRows.push({
            snapshot_gw: eventGw || manager.current_event || null,
            manager_entry_id: manager.entry_id,
            overall_rank: manager.overall_rank,
            total_points: manager.total_points,
            captain_player_id: captain?.element || null,
            formation,
            created_at: nowFn(),
          });

          for (const pick of picks) {
            pickRows.push({
              snapshot_gw: eventGw || manager.current_event || null,
              manager_entry_id: manager.entry_id,
              player_id: pick.element,
              position_slot: pick.position,
              is_captain: Boolean(pick.is_captain),
              is_vice_captain: Boolean(pick.is_vice_captain),
              created_at: nowFn(),
            });
          }
        } catch {
          continue;
        }
      }

      return {
        snapshotGw: eventGw,
        managers: managerRows,
        picks: pickRows,
      };
    },
  };
}
