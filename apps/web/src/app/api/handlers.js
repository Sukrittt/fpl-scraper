export async function getSettingsHandler({ db }) {
  const settings = await db.getOne('settings');
  return { status: 200, body: settings || null };
}

export async function getRecommendationsHandler({ db }) {
  const rows = await db.getAll('recommendations_snapshot');
  return { status: 200, body: rows };
}

export async function getRunsHandler({ db, query = {} }) {
  const rows = await db.getAll('pipeline_runs');
  const limit = Number(query.limit || 20);
  const sorted = [...rows]
    .filter((row) => row.run_id)
    .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 20);
  return { status: 200, body: sorted };
}

export async function getEventsHandler({ db, query = {} }) {
  const rows = await db.getAll('pipeline_events');
  const limit = Number(query.limit || 30);
  const sorted = [...rows]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 30);
  return { status: 200, body: sorted };
}

export async function getVideosHandler({ db, query = {} }) {
  const rows = await db.getAll('videos');
  const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
  return { status: 200, body: filtered };
}

export async function postSyncRunHandler({ runPipeline }) {
  const run = await runPipeline();
  return { status: 202, body: run };
}
