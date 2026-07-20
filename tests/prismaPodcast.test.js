import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

import {
  activePodcastChapter,
  clampPodcastSeek,
  formatPlayerTime,
  formatPodcastDuration,
  podcastAssetPath,
  podcastProgress,
  podcastShareUrl,
  podcastTopicArtwork,
  requestedPodcastChapter,
} from '../public/editions/prisma/podcast.js';

test('formats the Prisma audio duration for listeners', () => {
  assert.equal(formatPodcastDuration(931), '15 min 31 sec');
});

test('makes daily audio paths relative to the Prisma edition', () => {
  assert.equal(podcastAssetPath('audio/daily-brief-2026-07-18.mp3'), '../../audio/daily-brief-2026-07-18.mp3');
});

test('formats player time for short and long briefings', () => {
  assert.equal(formatPlayerTime(0), '0:00');
  assert.equal(formatPlayerTime(1123.632), '18:44');
  assert.equal(formatPlayerTime(3723), '1:02:03');
});

test('clamps ten-second seeking to the playable audio range', () => {
  assert.equal(clampPodcastSeek(5, -10, 1124), 0);
  assert.equal(clampPodcastSeek(1119, 10, 1124), 1124);
  assert.equal(clampPodcastSeek(30, -10, 1124), 20);
});

test('calculates bounded progress for the timeline', () => {
  assert.equal(podcastProgress(281, 1124), 25);
  assert.equal(podcastProgress(1200, 1124), 100);
  assert.equal(podcastProgress(10, 0), 0);
});

test('finds the active topic chapter at the current playback time', () => {
  const chapters = [
    { id: 'ai', title: 'AI', startSeconds: 12 },
    { id: 'energy', title: 'Energy and Utilities', startSeconds: 347 },
  ];
  assert.equal(activePodcastChapter(chapters, 5), null);
  assert.equal(activePodcastChapter(chapters, 12)?.id, 'ai');
  assert.equal(activePodcastChapter(chapters, 500)?.id, 'energy');
});

test('maps podcast topics to their generated artwork', () => {
  assert.equal(podcastTopicArtwork('ai'), 'media/topics/ai.webp');
  assert.equal(podcastTopicArtwork('kentucky_healthcare'), 'media/topics/kentucky-healthcare.webp');
  assert.equal(podcastTopicArtwork('unknown'), null);
});

test('builds shareable category URLs from the current Prisma edition', () => {
  const url = podcastShareUrl('energy', 'https://example.com/dustin-ai-playground/editions/prisma/?listen=ai');
  assert.equal(url, 'https://example.com/dustin-ai-playground/editions/prisma/share/energy/');
});

test('reads a requested category from a shared listening link', () => {
  assert.equal(requestedPodcastChapter('?listen=louisville'), 'louisville');
  assert.equal(requestedPodcastChapter('?other=value'), null);
});

test('ships accessible custom podcast navigation controls', async () => {
  const html = await readFile(new URL('../public/editions/prisma/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="podcastPlay"[^>]*aria-label="Play briefing"/);
  assert.match(html, /id="podcastBack"[^>]*aria-label="Go back 10 seconds"/);
  assert.match(html, /id="podcastForward"[^>]*aria-label="Go forward 10 seconds"/);
  assert.match(html, /id="podcastTimeline"[^>]*aria-label="Briefing progress"/);
  assert.match(html, /id="podcastChapterButtons"[^>]*aria-label="Play a briefing topic"/);
  assert.match(html, /id="podcastArtwork"[^>]*alt=""/);
  assert.match(html, /id="podcastShare"[^>]*aria-label="Share this topic"/);
  assert.doesNotMatch(html, /id="podcastChapter"/);
  assert.match(html, /id="podcastSpeed"[^>]*aria-label="Playback speed"/);
});

test('provides a social preview page for every podcast category', async () => {
  const topics = ['ai', 'energy', 'humana', 'kentucky_healthcare', 'analytics', 'louisville'];
  const slugs = { kentucky_healthcare: 'kentucky-healthcare' };
  for (const topic of topics) {
    const slug = slugs[topic] || topic;
    const html = await readFile(new URL(`../public/editions/prisma/share/${slug}/index.html`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`property="og:image"[^>]+${slug}-share\\.jpg`));
    assert.match(html, new RegExp(`\\?listen=${topic}`));
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
});
