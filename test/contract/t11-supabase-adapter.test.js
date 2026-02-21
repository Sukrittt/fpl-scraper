import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../../apps/web/src/lib/db.js';

function makeSupabaseClient(seed = {}) {
  const state = new Map(Object.entries(seed));

  return {
    from(table) {
      return {
        async insert(row) {
          if (!state.has(table)) state.set(table, []);
          state.get(table).push(structuredClone(row));
          return { error: null };
        },
        async upsert(row) {
          if (!state.has(table)) state.set(table, []);
          const rows = state.get(table);
          if (rows.length === 0) rows.push(structuredClone(row));
          else rows[0] = { ...rows[0], ...structuredClone(row) };
          return { error: null };
        },
        select() {
          return {
            async maybeSingle() {
              const rows = state.get(table) || [];
              return { data: rows[0] || null, error: null };
            },
            async then(resolve) {
              resolve({ data: state.get(table) || [], error: null });
            },
          };
        },
      };
    },
  };
}

test('createDatabase can use supabase provider', async () => {
  const db = createDatabase({ provider: 'supabase', supabaseClient: makeSupabaseClient() });

  await db.upsert('settings', { entry_id: 55 });
  const settings = await db.getOne('settings');

  assert.equal(settings.entry_id, 55);
});

test('supabase provider supports insert/getAll', async () => {
  const db = createDatabase({ provider: 'supabase', supabaseClient: makeSupabaseClient() });

  await db.insert('videos', { video_id: 'abc', status: 'processed' });
  const videos = await db.getAll('videos');

  assert.equal(videos.length, 1);
  assert.equal(videos[0].video_id, 'abc');
});
