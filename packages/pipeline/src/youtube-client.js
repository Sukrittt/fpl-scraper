import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function normalizeVideo(item) {
  return {
    video_id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    published_at: item.snippet.publishedAt,
  };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\\//g, '/');
}

function extractBalancedJson(source, startIndex) {
  const start = source.indexOf('{', startIndex);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  if (end < 0) {
    return null;
  }

  return source.slice(start, end + 1);
}

function extractCaptionBaseUrl(watchHtml) {
  const captionsIndex = watchHtml.indexOf('"captions":');
  if (captionsIndex >= 0) {
    const jsonRaw = extractBalancedJson(watchHtml, captionsIndex);
    const decoded = jsonRaw ? decodeHtmlEntities(jsonRaw) : null;

    try {
      const captions = decoded ? JSON.parse(decoded) : null;
      const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length > 0) {
        return tracks[0].baseUrl || null;
      }
    } catch {
      // fall through to ytInitialPlayerResponse parser
    }
  }

  const playerIndex = watchHtml.indexOf('ytInitialPlayerResponse');
  if (playerIndex >= 0) {
    const jsonRaw = extractBalancedJson(watchHtml, playerIndex);
    const decoded = jsonRaw ? decodeHtmlEntities(jsonRaw) : null;
    try {
      const playerResponse = decoded ? JSON.parse(decoded) : null;
      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length > 0) {
        return tracks[0].baseUrl || null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function transcriptFromJson3(payload) {
  const eventLines = [];
  for (const event of payload.events || []) {
    const segments = [];
    for (const seg of event.segs || []) {
      if (seg.utf8) {
        segments.push(seg.utf8);
      }
    }
    if (segments.length > 0) {
      eventLines.push(segments.join(''));
    }
  }

  const joined = eventLines.join(' ').replace(/\s+/g, ' ').trim();
  return joined || null;
}

async function fetchJsonPayload(fetchFn, url) {
  try {
    const response = await fetchFn(url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

function flattenCaptionTracks(container = {}) {
  return Object.entries(container)
    .filter(([lang]) => lang.startsWith('en'))
    .flatMap(([, tracks]) => (Array.isArray(tracks) ? tracks : []));
}

function pickCaptionUrlFromYtDlpJson(metadata) {
  const subtitleTracks = flattenCaptionTracks(metadata?.subtitles);
  const autoTracks = flattenCaptionTracks(metadata?.automatic_captions);
  const tracks = [...subtitleTracks, ...autoTracks];

  if (tracks.length === 0) {
    return null;
  }

  const json3 = tracks.find((track) => track?.ext === 'json3' && track?.url);
  if (json3?.url) {
    return json3.url;
  }

  const first = tracks.find((track) => typeof track?.url === 'string');
  return first?.url || null;
}

async function fetchTranscriptViaYtDlp({ videoId, fetchFn, watchBaseUrl, execFileFn }) {
  try {
    const videoUrl = `${watchBaseUrl}/watch?v=${videoId}`;
    const { stdout } = await execFileFn('yt-dlp', [
      '--skip-download',
      '--write-auto-subs',
      '--write-subs',
      '--sub-langs',
      'en.*,en',
      '--sub-format',
      'json3',
      '--dump-single-json',
      videoUrl,
    ], {
      maxBuffer: 1024 * 1024 * 10,
    });

    const metadata = JSON.parse(stdout || '{}');
    const captionUrl = pickCaptionUrlFromYtDlpJson(metadata);
    if (!captionUrl) {
      return null;
    }

    const url = captionUrl.includes('fmt=json3')
      ? captionUrl
      : `${captionUrl}${captionUrl.includes('?') ? '&' : '?'}fmt=json3`;

    const payload = await fetchJsonPayload(fetchFn, url);
    if (!payload) {
      return null;
    }

    return transcriptFromJson3(payload);
  } catch {
    return null;
  }
}

export function createYoutubeClient({
  fetchFn = fetch,
  apiBaseUrl = 'https://www.googleapis.com/youtube/v3',
  watchBaseUrl = 'https://www.youtube.com',
  apiKey = process.env.YOUTUBE_API_KEY || '',
  captionedOnly = true,
  enableYtDlpFallback = process.env.YOUTUBE_USE_YTDLP !== '0',
  transcriptFallbackFn = null,
  execFileFn = execFileAsync,
} = {}) {
  async function runFallback(videoId) {
    if (transcriptFallbackFn) {
      return transcriptFallbackFn(videoId);
    }
    if (enableYtDlpFallback) {
      return fetchTranscriptViaYtDlp({
        videoId,
        fetchFn,
        watchBaseUrl,
        execFileFn,
      });
    }
    return null;
  }

  return {
    async fetchRecentVideos(channelIds) {
      const videos = [];

      for (const channelId of channelIds) {
        const params = new URLSearchParams({
          part: 'snippet',
          channelId,
          order: 'date',
          type: 'video',
          maxResults: '15',
        });

        if (captionedOnly) {
          params.set('videoCaption', 'closedCaption');
        }

        if (apiKey) {
          params.set('key', apiKey);
        }

        const endpoint = `${apiBaseUrl}/search?${params.toString()}`;
        const response = await fetchFn(endpoint);
        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const normalized = (data.items || []).map(normalizeVideo);
        videos.push(...normalized);
      }

      return videos;
    },

    async fetchTranscript(videoId) {
      try {
        const watchResponse = await fetchFn(`${watchBaseUrl}/watch?v=${videoId}`);
        if (!watchResponse.ok) {
          return runFallback(videoId);
        }

        const html = await watchResponse.text();
        const baseUrl = extractCaptionBaseUrl(html);
        if (!baseUrl) {
          // Fallback: try direct timedtext endpoints for manual/auto English captions.
          const fallbackUrls = [
            `${watchBaseUrl}/api/timedtext?lang=en&v=${videoId}&fmt=json3`,
            `${watchBaseUrl}/api/timedtext?lang=en-US&v=${videoId}&fmt=json3`,
            `${watchBaseUrl}/api/timedtext?lang=en-GB&v=${videoId}&fmt=json3`,
            `${watchBaseUrl}/api/timedtext?lang=en&kind=asr&v=${videoId}&fmt=json3`,
          ];

          for (const url of fallbackUrls) {
            const payload = await fetchJsonPayload(fetchFn, url);
            const transcript = payload ? transcriptFromJson3(payload) : null;
            if (transcript) {
              return transcript;
            }
          }

          return runFallback(videoId);
        }

        const transcriptUrl = `${baseUrl}&fmt=json3`;
        const payload = await fetchJsonPayload(fetchFn, transcriptUrl);
        if (!payload) {
          return runFallback(videoId);
        }
        return transcriptFromJson3(payload);
      } catch {
        return runFallback(videoId);
      }
    },
  };
}
