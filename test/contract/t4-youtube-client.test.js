import test from 'node:test';
import assert from 'node:assert/strict';
import { createYoutubeClient } from '../../packages/pipeline/src/youtube-client.js';

test('fetchRecentVideos returns normalized videos', async () => {
  let capturedUrl = '';
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          id: { videoId: 'abc' },
          snippet: {
            title: 'Best FPL Picks',
            channelTitle: 'FPL Guru',
            publishedAt: '2026-02-20T10:00:00Z',
          },
        },
      ],
    }),
  });

  const captureFetch = async (url) => {
    capturedUrl = String(url);
    return mockFetch();
  };

  const client = createYoutubeClient({ fetchFn: captureFetch, apiKey: 'yt-key-123' });
  const videos = await client.fetchRecentVideos(['channel1']);

  assert.equal(videos.length, 1);
  assert.equal(videos[0].video_id, 'abc');
  assert.equal(videos[0].title, 'Best FPL Picks');
  assert.match(capturedUrl, /channelId=channel1/);
  assert.match(capturedUrl, /key=yt-key-123/);
  assert.match(capturedUrl, /videoCaption=closedCaption/);
});

test('fetchTranscript returns null when transcript missing', async () => {
  const mockFetch = async () => ({
    ok: false,
  });

  const client = createYoutubeClient({ fetchFn: mockFetch });
  const transcript = await client.fetchTranscript('no-caption-video');

  assert.equal(transcript, null);
});

test('fetchTranscript returns null when transcript payload is invalid JSON', async () => {
  let call = 0;
  const mockFetch = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        text: async () => '{"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https:\\/\\/example.com\\/captions"}]}}}',
      };
    }
    return {
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    };
  };

  const client = createYoutubeClient({ fetchFn: mockFetch });
  const transcript = await client.fetchTranscript('broken-json3');

  assert.equal(transcript, null);
});

test('fetchTranscript can parse captions from ytInitialPlayerResponse', async () => {
  let call = 0;
  const mockFetch = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        text: async () => '... ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https:\\/\\/example.com\\/captions?lang=en"}]}}}; ...',
      };
    }
    return {
      ok: true,
      json: async () => ({
        events: [{ segs: [{ utf8: 'Salah ' }, { utf8: 'is great' }] }],
      }),
    };
  };

  const client = createYoutubeClient({ fetchFn: mockFetch });
  const transcript = await client.fetchTranscript('video-with-player-response');

  assert.equal(transcript, 'Salah is great');
});

test('fetchTranscript can fallback to timedtext when watch html has no captions blob', async () => {
  let call = 0;
  const mockFetch = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        text: async () => '<html><body>no captions or player blob</body></html>',
      };
    }
    return {
      ok: true,
      json: async () => ({
        events: [{ segs: [{ utf8: 'Palmer ' }, { utf8: 'looks sharp' }] }],
      }),
    };
  };

  const client = createYoutubeClient({ fetchFn: mockFetch });
  const transcript = await client.fetchTranscript('timedtext-fallback');

  assert.equal(transcript, 'Palmer looks sharp');
});

test('fetchTranscript can use injected fallback provider when timedtext fails', async () => {
  let fallbackCalls = 0;
  const mockFetch = async () => ({
    ok: false,
    text: async () => '<html></html>',
    json: async () => ({}),
  });

  const client = createYoutubeClient({
    fetchFn: mockFetch,
    enableYtDlpFallback: false,
    transcriptFallbackFn: async (videoId) => {
      fallbackCalls += 1;
      assert.equal(videoId, 'fallback-video');
      return 'Fallback transcript text';
    },
  });

  const transcript = await client.fetchTranscript('fallback-video');
  assert.equal(transcript, 'Fallback transcript text');
  assert.equal(fallbackCalls, 1);
});
