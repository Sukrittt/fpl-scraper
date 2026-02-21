function unwrapError(result, table, action) {
  if (result?.error) {
    throw new Error(`Supabase ${action} failed for ${table}: ${result.error.message || result.error}`);
  }
}

async function selectFirstRow({ client, table, columns = '*' }) {
  const query = client.from(table).select(columns);

  if (typeof query.limit === 'function') {
    const result = await query.limit(1);
    unwrapError(result, table, 'select one');
    if (!Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }
    return result.data[0];
  }

  if (typeof query.maybeSingle === 'function') {
    const result = await query.maybeSingle();
    unwrapError(result, table, 'select one');
    return result.data || null;
  }

  const result = await query;
  unwrapError(result, table, 'select one');
  if (!Array.isArray(result.data) || result.data.length === 0) {
    return null;
  }
  return result.data[0];
}

export function createSupabaseDatabase({ client }) {
  return {
    hasTable() {
      return true;
    },

    createTable() {
      return;
    },

    async upsert(table, row) {
      let payload = row;

      // Settings is treated as a singleton in app logic; preserve the first row id
      // so repeated upserts update in place instead of creating duplicates.
      if (table === 'settings' && !row.id) {
        const existing = await selectFirstRow({ client, table, columns: 'id' });
        if (existing?.id) {
          payload = { ...row, id: existing.id };
        }
      }

      const result = await client.from(table).upsert(payload);
      unwrapError(result, table, 'upsert');
    },

    async insert(table, row) {
      const result = await client.from(table).insert(row);
      unwrapError(result, table, 'insert');
    },

    async getOne(table) {
      return selectFirstRow({ client, table });
    },

    async getAll(table) {
      const result = await client.from(table).select('*');
      unwrapError(result, table, 'select all');
      return result.data || [];
    },
  };
}
