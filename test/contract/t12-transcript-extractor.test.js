import test from 'node:test';
import assert from 'node:assert/strict';
import { createYoutubeClient } from '../../packages/pipeline/src/youtube-client.js';

function responseWithText(text) {
  return {
    ok: true,
    async text() {
      return text;
    },
  };
}

function responseWithJson(json) {
  return {
    ok: true,
    async json() {
      return json;
    },
  };
}

test('fetchTranscript extracts transcript from YouTube caption tracks', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/watch?v=')) {
      return responseWithText('"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc&lang=en"}]}}');
    }

    return responseWithJson({
      events: [
        { segs: [{ utf8: 'Salah ' }, { utf8: 'is great' }] },
        { segs: [{ utf8: 'buy now' }] },
      ],
    });
  };

  const client = createYoutubeClient({ fetchFn });
  const transcript = await client.fetchTranscript('abc');

  assert.equal(transcript, 'Salah is great buy now');
});

test('fetchTranscript returns null when watch page has no captions', async () => {
  const fetchFn = async () => responseWithText('<html>No captions</html>');
  const client = createYoutubeClient({ fetchFn });
  const transcript = await client.fetchTranscript('no-caption-video');
  assert.equal(transcript, null);
});
