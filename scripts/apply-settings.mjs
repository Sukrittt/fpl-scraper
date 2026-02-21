import { GET as getSettingsRoute, POST as postSettingsRoute } from '../apps/web/src/app/api/settings/route.js';
import { resetAppInstance } from '../apps/web/src/app/app-instance.js';

function parseArgs(argv) {
  const args = { entryId: null, channels: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--entry-id') {
      args.entryId = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--channels') {
      args.channels = String(argv[i + 1] || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      i += 1;
    }
  }
  return args;
}

async function main() {
  const { entryId, channels } = parseArgs(process.argv.slice(2));

  if (!Number.isFinite(entryId) || entryId <= 0) {
    throw new Error('Provide a valid FPL entry id: --entry-id <number>');
  }

  if (channels.length === 0) {
    throw new Error('Provide at least one YouTube channel id: --channels <id1,id2,...>');
  }

  resetAppInstance();
  const existingRes = await getSettingsRoute();
  const existing = await existingRes.json();

  const payload = {
    entry_id: entryId,
    ollama_base_url: existing?.ollama_base_url || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    ollama_model: existing?.ollama_model || process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct',
    channels,
  };

  const postReq = new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const postRes = await postSettingsRoute(postReq);
  const postBody = await postRes.json();
  if (postRes.status !== 200) {
    throw new Error(`Settings update failed with status ${postRes.status}`);
  }

  const finalRes = await getSettingsRoute();
  const finalBody = await finalRes.json();

  console.log(`Settings updated. entry_id=${postBody.entry_id}, channels=${postBody.channels.length}`);
  console.log(JSON.stringify(finalBody, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
