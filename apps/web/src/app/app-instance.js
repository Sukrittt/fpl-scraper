import { createApp } from './server.js';
import { createFplClient } from '../../../../packages/pipeline/src/fpl-client.js';
import { createYoutubeClient } from '../../../../packages/pipeline/src/youtube-client.js';
import { createOllamaClient } from '../../../../packages/pipeline/src/ollama-client.js';
import { createSupabaseClientFromEnv } from '../lib/supabase-client.js';

let appPromise;

function defaultNow() {
  return new Date().toISOString();
}

function createDefaultClients() {
  if (process.env.ENABLE_LIVE_CLIENTS !== '1') {
    return {
      youtubeClient: {
        async fetchRecentVideos() {
          return [];
        },
        async fetchTranscript() {
          return null;
        },
      },
      fplClient: {
        async fetchBootstrapPlayers() {
          return [];
        },
        async fetchCurrentEvent() {
          return 1;
        },
        async fetchTopManagers() {
          return [];
        },
        async fetchTeamByEntryId() {
          return [];
        },
      },
      ollamaClient: {
        async summarizeTranscript() {
          return '';
        },
        async extractPlayerMentions() {
          return [];
        },
      },
    };
  }

  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is required when ENABLE_LIVE_CLIENTS=1');
  }

  return {
    youtubeClient: createYoutubeClient({
      apiKey: process.env.YOUTUBE_API_KEY,
      captionedOnly: process.env.YOUTUBE_ONLY_CAPTIONED !== '0',
    }),
    fplClient: createFplClient(),
    ollamaClient: createOllamaClient({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct',
    }),
  };
}

async function buildApp() {
  const provider = process.env.DB_PROVIDER || 'memory';
  const clients = createDefaultClients();

  if (provider === 'supabase') {
    const supabaseClient = await createSupabaseClientFromEnv();
    return createApp({
      nowFn: defaultNow,
      ...clients,
      dbProvider: 'supabase',
      supabaseClient,
    });
  }

  return createApp({ nowFn: defaultNow, ...clients, dbProvider: 'memory' });
}

export async function getAppInstance() {
  if (!appPromise) {
    appPromise = buildApp();
  }

  return appPromise;
}

export function resetAppInstance() {
  appPromise = undefined;
}
