import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPodcastDuration, podcastAssetPath } from '../public/editions/prisma/podcast.js';

test('formats the Prisma audio duration for listeners', () => {
  assert.equal(formatPodcastDuration(931), '15 min 31 sec');
});

test('makes daily audio paths relative to the Prisma edition', () => {
  assert.equal(podcastAssetPath('audio/daily-brief-2026-07-18.mp3'), '../../audio/daily-brief-2026-07-18.mp3');
});
