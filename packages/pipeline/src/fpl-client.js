function assertOk(response, endpoint) {
  if (!response.ok) {
    throw new Error(`FPL request failed for ${endpoint}`);
  }
}

export function createFplClient({ fetchFn = fetch, baseUrl = 'https://fantasy.premierleague.com/api' } = {}) {
  return {
    async fetchBootstrapPlayers() {
      const endpoint = `${baseUrl}/bootstrap-static/`;
      const response = await fetchFn(endpoint);
      assertOk(response, endpoint);

      const data = await response.json();
      return (data.elements || []).map((player) => ({
        player_id: player.id,
        player_name: player.web_name,
        team_id: player.team,
        position_id: player.element_type,
        price: Number(player.now_cost) / 10,
        form: Number(player.form || 0),
      }));
    },

    async fetchTeamByEntryId(entryId) {
      const endpoint = `${baseUrl}/entry/${entryId}/event/1/picks/`;
      const response = await fetchFn(endpoint);
      assertOk(response, endpoint);

      const data = await response.json();
      return data.picks || [];
    },
  };
}
