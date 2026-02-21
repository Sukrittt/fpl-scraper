function assertOk(response, endpoint) {
  if (!response.ok) {
    throw new Error(`FPL request failed for ${endpoint}`);
  }
}

export function createFplClient({ fetchFn = fetch, baseUrl = 'https://fantasy.premierleague.com/api' } = {}) {
  async function fetchJson(endpoint) {
    const response = await fetchFn(endpoint);
    assertOk(response, endpoint);
    return response.json();
  }

  return {
    async fetchBootstrapPlayers() {
      const endpoint = `${baseUrl}/bootstrap-static/`;
      const data = await fetchJson(endpoint);
      return (data.elements || []).map((player) => ({
        player_id: player.id,
        player_name: player.web_name,
        team_id: player.team,
        position_id: player.element_type,
        price: Number(player.now_cost) / 10,
        form: Number(player.form || 0),
      }));
    },

    async fetchCurrentEvent() {
      const endpoint = `${baseUrl}/bootstrap-static/`;
      const data = await fetchJson(endpoint);
      const current = (data.events || []).find((row) => row.is_current) || (data.events || []).find((row) => row.is_next);
      return current?.id || null;
    },

    async fetchTopManagers({ limit = 10000, event = null } = {}) {
      const leagueId = process.env.FPL_ELITE_LEAGUE_ID || '314';
      const managers = [];
      const pages = Math.max(1, Math.ceil(limit / 50));
      const endpointVariants = (page) => ([
        `${baseUrl}/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
        `${baseUrl}/leagues-classic/${leagueId}/standings/?page_standings=${page}&phase=1`,
      ]);

      for (let page = 1; page <= pages; page += 1) {
        let data = null;
        for (const endpoint of endpointVariants(page)) {
          try {
            data = await fetchJson(endpoint);
            if (data) {
              break;
            }
          } catch {
            data = null;
          }
        }

        if (!data) {
          break;
        }

        const rows = data?.standings?.results || [];
        if (rows.length === 0) {
          break;
        }

        managers.push(...rows.map((row) => ({
          entry_id: row.entry,
          overall_rank: row.rank,
          total_points: row.total,
          current_event: event || null,
        })));

        if (managers.length >= limit) {
          break;
        }
      }

      return managers.slice(0, limit);
    },

    async fetchTeamByEntryId(entryId, event = 1) {
      const endpoint = `${baseUrl}/entry/${entryId}/event/${event}/picks/`;
      const data = await fetchJson(endpoint);
      return data.picks || [];
    },
  };
}
