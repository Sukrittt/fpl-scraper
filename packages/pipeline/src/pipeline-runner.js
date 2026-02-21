import { classifyAction, scorePlayer } from './scoring.js';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

export function createPipelineRunner({ db, fplClient, youtubeClient, ollamaClient, nowFn = () => new Date().toISOString() }) {
  return {
    async run({ entryId, channels }) {
      const startedAt = nowFn();
      const runId = `run-${Date.now()}`;

      await db.insert('pipeline_runs', {
        run_id: runId,
        started_at: startedAt,
        status: 'running',
      });

      const videos = await youtubeClient.fetchRecentVideos(channels);
      const players = await fplClient.fetchBootstrapPlayers();
      await fplClient.fetchTeamByEntryId(entryId);

      const mentionsByName = new Map();
      let processedCount = 0;
      let skippedMissingTranscriptCount = 0;

      if (videos.length === 0) {
        await db.insert('pipeline_events', {
          run_id: runId,
          level: 'warn',
          message: 'No videos fetched from YouTube channels; check channel ids and YOUTUBE_API_KEY',
          created_at: nowFn(),
        });
      }

      for (const video of videos) {
        try {
          const transcript = await youtubeClient.fetchTranscript(video.video_id);
          if (!transcript) {
            skippedMissingTranscriptCount += 1;
            await db.insert('videos', {
              ...video,
              status: 'skipped',
              skip_reason: 'missing_transcript',
              processed_at: nowFn(),
            });
            continue;
          }

          const summary = await ollamaClient.summarizeTranscript(transcript);
          const mentions = await ollamaClient.extractPlayerMentions(summary);

          await db.insert('videos', {
            ...video,
            status: 'processed',
            processed_at: nowFn(),
          });
          processedCount += 1;

          for (const mention of mentions) {
            const key = normalizeName(mention.player_name);
            if (!mentionsByName.has(key)) {
              mentionsByName.set(key, []);
            }

            mentionsByName.get(key).push({ ...mention, video_id: video.video_id, title: video.title, channel: video.channel, published_at: video.published_at });
            await db.insert('video_player_mentions', {
              video_id: video.video_id,
              player_name: mention.player_name,
              sentiment: mention.sentiment,
              confidence: mention.confidence,
            });
          }
        } catch (error) {
          await db.insert('videos', {
            ...video,
            status: 'skipped',
            skip_reason: 'processing_error',
            processed_at: nowFn(),
          });
          await db.insert('pipeline_events', {
            run_id: runId,
            level: 'warn',
            message: `Video processing failed for ${video.video_id}: ${error?.message || String(error)}`,
            created_at: nowFn(),
          });
        }
      }

      for (const player of players) {
        const key = normalizeName(player.player_name);
        const mentions = mentionsByName.get(key) || [];
        const sentiment = mentions.length > 0
          ? mentions.reduce((acc, item) => acc + Number(item.sentiment || 0), 0) / mentions.length
          : 50;
        const transcriptCoverage = videos.length === 0 ? 0 : mentions.length / videos.length;

        const { score, confidence } = scorePlayer({
          form: Number(player.form || 0) * 10,
          fixtures: 60,
          minutes: 70,
          value: Math.max(0, Math.min(100, (player.price ? (10 / player.price) * 10 : 50))),
          sentiment,
          transcriptCoverage,
        });

        const action = classifyAction({ score, confidence });

        await db.insert('recommendations_snapshot', {
          player_id: player.player_id,
          player_name: player.player_name,
          action,
          confidence: Math.round(confidence),
          score_5gw: Math.round(score),
          reasons: [
            `Form signal ${Math.round(Number(player.form || 0) * 10)}`,
            `Sentiment ${Math.round(sentiment)}`,
          ],
          evidence_videos: mentions.slice(0, 3).map((item) => ({
            video_id: item.video_id,
            title: item.title,
            channel: item.channel,
            published_at: item.published_at,
          })),
          updated_at: nowFn(),
        });
      }

      await db.insert('pipeline_events', {
        run_id: runId,
        level: 'info',
        message: `Pipeline completed (videos_fetched=${videos.length}, videos_processed=${processedCount}, videos_skipped_missing_transcript=${skippedMissingTranscriptCount}, players_scored=${players.length})`,
        created_at: nowFn(),
      });

      await db.insert('pipeline_runs', {
        run_id: runId,
        finished_at: nowFn(),
        status: 'completed',
      });

      return { run_id: runId, status: 'completed' };
    },
  };
}
