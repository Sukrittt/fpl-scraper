import { classifyAction, scorePlayer } from './scoring.js';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function latestSnapshot(rows = []) {
  return [...rows].sort((a, b) => {
    const gwDelta = Number(b.snapshot_gw || 0) - Number(a.snapshot_gw || 0);
    if (gwDelta !== 0) return gwDelta;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  })[0]?.snapshot_gw;
}

async function safeGetAll(db, table) {
  try {
    return await db.getAll(table);
  } catch {
    return [];
  }
}

export function createPipelineRunner({ db, fplClient, youtubeClient, ollamaClient, nowFn = () => new Date().toISOString() }) {
  return {
    async run({ entryId, channels }) {
      const startedAt = nowFn();
      const runId = `run-${Date.now()}`;

      await db.upsert('pipeline_runs', {
        run_id: runId,
        started_at: startedAt,
        finished_at: null,
        status: 'running',
      });

      let finalStatus = 'failed';
      let runError = null;

      try {
        const videos = await youtubeClient.fetchRecentVideos(channels);
        const players = await fplClient.fetchBootstrapPlayers();
        const teamPicks = await fplClient.fetchTeamByEntryId(entryId);
        const teamPlayerSet = new Set((teamPicks || []).map((pick) => Number(pick.element || pick.player_id)).filter(Boolean));

        const allTemplateRows = await safeGetAll(db, 'elite_template_snapshot');
        const templateGw = latestSnapshot(allTemplateRows);
        const templateRows = templateGw === undefined
          ? []
          : allTemplateRows.filter((row) => Number(row.snapshot_gw) === Number(templateGw));
        const templateByPlayer = new Map(templateRows.map((row) => [Number(row.player_id), row]));

        const allInsights = await safeGetAll(db, 'team_strategy_insights');
        const latestInsight = [...allInsights]
          .filter((row) => Number(row.entry_id || 0) === Number(entryId || 0))
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
        const recommendedIn = new Set((latestInsight?.recommended_in || []).map((row) => Number(row.player_id)).filter(Boolean));
        const recommendedOut = new Set((latestInsight?.recommended_out || []).map((row) => Number(row.player_id)).filter(Boolean));

        const mentionsByName = new Map();
        let processedCount = 0;
        let skippedMissingTranscriptCount = 0;
        const skipReasonCounts = new Map();
        const actionCounts = { BUY: 0, SELL: 0, HOLD: 0 };

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
            let transcript = null;
            let transcriptReason = 'missing_transcript';
            if (typeof youtubeClient.fetchTranscriptWithDiagnostics === 'function') {
              const result = await youtubeClient.fetchTranscriptWithDiagnostics(video.video_id);
              transcript = result?.transcript || null;
              transcriptReason = result?.reason || 'missing_transcript';
            } else {
              transcript = await youtubeClient.fetchTranscript(video.video_id);
            }

            if (!transcript) {
              skippedMissingTranscriptCount += 1;
              skipReasonCounts.set(transcriptReason, (skipReasonCounts.get(transcriptReason) || 0) + 1);
              await db.insert('videos', {
                ...video,
                status: 'skipped',
                skip_reason: transcriptReason,
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
          const template = templateByPlayer.get(Number(player.player_id)) || null;
          const momentumSignal = Number(template?.buy_momentum || 0) - Number(template?.sell_momentum || 0);
          const teamNeedFit = recommendedIn.has(Number(player.player_id))
            ? 78
            : recommendedOut.has(Number(player.player_id))
              ? 22
              : teamPlayerSet.has(Number(player.player_id))
                ? 45
                : 55;
          const templateAlignment = Number(template?.template_ownership_pct || 50);
          const volatilityRisk = templateAlignment < 5 && momentumSignal < 1 ? 70 : 20;

          const { score, confidence } = scorePlayer({
            form: Number(player.form || 0) * 10,
            fixtures: 60,
            minutes: 70,
            value: Math.max(0, Math.min(100, (player.price ? (10 / player.price) * 10 : 50))),
            sentiment,
            transcriptCoverage,
            templateAlignment,
            eliteMomentum: momentumSignal,
            teamNeedFit,
            volatilityRisk,
          });

          const action = classifyAction({ score, confidence });
          actionCounts[action] = (actionCounts[action] || 0) + 1;
          const teamFitReason = recommendedIn.has(Number(player.player_id))
            ? 'Template gap in your team'
            : recommendedOut.has(Number(player.player_id))
              ? 'Potential sell candidate in your team'
              : 'Neutral fit';
          const templateGapScore = Math.round(Math.max(0, templateAlignment - (teamPlayerSet.has(Number(player.player_id)) ? 0 : 40)));
          const riskTier = confidence >= 74 ? 'core' : confidence >= 60 ? 'balanced' : 'high_variance';

          await db.insert('recommendations_snapshot', {
            run_id: runId,
            player_id: player.player_id,
            player_name: player.player_name,
            action,
            confidence: Math.round(confidence),
            score_5gw: Math.round(score),
            template_ownership_pct: Math.round(Number(template?.template_ownership_pct || 0)),
            template_gap_score: templateGapScore,
            momentum_signal: Math.round(momentumSignal * 100) / 100,
            risk_tier: riskTier,
            team_fit_reason: teamFitReason,
            reasons: [
              `Form signal ${Math.round(Number(player.form || 0) * 10)}`,
              `Sentiment ${Math.round(sentiment)}`,
              `Template ${Math.round(templateAlignment)}%`,
              `Momentum ${Math.round(momentumSignal * 100) / 100}`,
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

        const totalScored = players.length || 0;
        if (totalScored > 0) {
          const buyRate = actionCounts.BUY / totalScored;
          if (buyRate < 0.03) {
            await db.insert('pipeline_events', {
              run_id: runId,
              level: 'warn',
              message: `Recommendation distribution alert (buy_rate=${Math.round(buyRate * 1000) / 10}%, buy=${actionCounts.BUY}, sell=${actionCounts.SELL}, hold=${actionCounts.HOLD})`,
              created_at: nowFn(),
            });
          }
        }

        await db.insert('pipeline_events', {
          run_id: runId,
          level: 'info',
          message: `Pipeline completed (videos_fetched=${videos.length}, videos_processed=${processedCount}, videos_skipped_missing_transcript=${skippedMissingTranscriptCount}, players_scored=${players.length})`,
          created_at: nowFn(),
        });

        if (skipReasonCounts.size > 0) {
          const reasonSummary = [...skipReasonCounts.entries()]
            .map(([reason, count]) => `${reason}:${count}`)
            .join(', ');
          await db.insert('pipeline_events', {
            run_id: runId,
            level: 'warn',
            message: `Transcript skip diagnostics (${reasonSummary})`,
            created_at: nowFn(),
          });
        }

        finalStatus = 'completed';
      } catch (error) {
        runError = error;
        await db.insert('pipeline_events', {
          run_id: runId,
          level: 'error',
          message: `Pipeline failed: ${error?.message || String(error)}`,
          created_at: nowFn(),
        });
      } finally {
        await db.upsert('pipeline_runs', {
          run_id: runId,
          started_at: startedAt,
          finished_at: nowFn(),
          status: finalStatus,
        });
      }

      if (runError) {
        throw runError;
      }

      return { run_id: runId, status: 'completed' };
    },
  };
}
