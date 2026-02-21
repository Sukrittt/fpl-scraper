import test from 'node:test';
import assert from 'node:assert/strict';
import { createFplClient } from '../../packages/pipeline/src/fpl-client.js';

test('fetchBootstrap normalizes player fields', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      elements: [
        {
          id: 1,
          web_name: 'Salah',
          team: 1,
          element_type: 3,
          now_cost: 130,
          form: '9.2',
        },
      ],
    }),
  });

  const client = createFplClient({ fetchFn: mockFetch, baseUrl: 'https://fantasy.premierleague.com/api' });
  const players = await client.fetchBootstrapPlayers();

  assert.equal(players[0].player_id, 1);
  assert.equal(players[0].player_name, 'Salah');
  assert.equal(players[0].price, 13.0);
});

test('fetchTeamByEntryId returns picks list', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      picks: [{ element: 99 }],
    }),
  });

  const client = createFplClient({ fetchFn: mockFetch, baseUrl: 'https://fantasy.premierleague.com/api' });
  const picks = await client.fetchTeamByEntryId(123456);

  assert.equal(picks.length, 1);
  assert.equal(picks[0].element, 99);
});
