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
          const queryState = {
            orderBy: null,
            ascending: true,
            limit: null,
          };

          const resolveRows = () => {
            let rows = [...(state.get(table) || [])];
            if (queryState.orderBy) {
              rows.sort((a, b) => {
                const av = a?.[queryState.orderBy];
                const bv = b?.[queryState.orderBy];
                if (av === bv) return 0;
                return queryState.ascending
                  ? (av > bv ? 1 : -1)
                  : (av < bv ? 1 : -1);
              });
            }
            if (typeof queryState.limit === 'number') {
              rows = rows.slice(0, queryState.limit);
            }
            return rows;
          };

          return {
            order(column, { ascending = true } = {}) {
              queryState.orderBy = column;
              queryState.ascending = ascending;
              return this;
            },
            limit(value) {
              queryState.limit = value;
              return Promise.resolve({ data: resolveRows(), error: null });
            },
            async maybeSingle() {
              const rows = resolveRows();
              return { data: rows[0] || null, error: null };
            },
            async then(resolve) {
              resolve({ data: resolveRows(), error: null });
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

test('supabase provider returns latest settings row by created_at', async () => {
  const db = createDatabase({ provider: 'supabase', supabaseClient: makeSupabaseClient() });

  await db.insert('settings', { id: 'old', entry_id: 111, channels: ['old'], created_at: '2026-02-21T10:00:00Z' });
  await db.insert('settings', { id: 'new', entry_id: 222, channels: ['new'], created_at: '2026-02-21T11:00:00Z' });

  const settings = await db.getOne('settings');
  assert.equal(settings.entry_id, 222);
  assert.deepEqual(settings.channels, ['new']);
});
