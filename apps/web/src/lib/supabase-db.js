function unwrapError(result, table, action) {
  if (result?.error) {
    throw new Error(`Supabase ${action} failed for ${table}: ${result.error.message || result.error}`);
  }
}

async function selectFirstRow({
  client,
  table,
  columns = '*',
  orderBy = null,
  ascending = true,
} = {}) {
  let query = client.from(table).select(columns);
  if (orderBy && typeof query.order === 'function') {
    query = query.order(orderBy, { ascending });
  }

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
        const existing = await selectFirstRow({
          client,
          table,
          columns: 'id,created_at',
          orderBy: 'created_at',
          ascending: false,
        });
        if (existing?.id) {
          payload = { ...row, id: existing.id };
        }
      }

      const options = table === 'pipeline_runs' ? { onConflict: 'run_id' } : undefined;
      const result = await client.from(table).upsert(payload, options);
      unwrapError(result, table, 'upsert');
    },

    async insert(table, row) {
      const result = await client.from(table).insert(row);
      unwrapError(result, table, 'insert');
    },

    async getOne(table) {
      if (table === 'settings') {
        return selectFirstRow({
          client,
          table,
          orderBy: 'created_at',
          ascending: false,
        });
      }
      return selectFirstRow({ client, table });
    },

    async getAll(table) {
      const pageSize = 1000;
      const rows = [];
      const baseQuery = client.from(table).select('*');

      if (typeof baseQuery.range !== 'function') {
        const result = await baseQuery;
        unwrapError(result, table, 'select all');
        return result.data || [];
      }

      for (let page = 0; page < 100; page += 1) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const result = await client.from(table).select('*').range(from, to);
        unwrapError(result, table, 'select all');
        const pageRows = result.data || [];
        rows.push(...pageRows);

        if (pageRows.length < pageSize) {
          break;
        }
      }

      return rows;
    },
  };
}
